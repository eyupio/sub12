package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvitationNotFound = errors.New("invitation not found")
	ErrInvitationExpired  = errors.New("invitation has expired")
	ErrInvitationDecided  = errors.New("invitation already decided")
	ErrSelfInvite         = errors.New("cannot invite yourself")
)

// EventInvitationTTL is the lifetime of a pending invitation. Re-sends to an
// already-pending invitation reuse the same token, so this only matters for
// the original send (or a re-send after expiry/decline).
const EventInvitationTTL = 30 * 24 * time.Hour

// EventInvitationBatchLimit bounds a single batch send so one request cannot
// fan out unbounded emails.
const EventInvitationBatchLimit = 50

type EventInvitationService struct {
	invitations   *repository.EventInvitationRepository
	events        *repository.EventRepository
	users         *repository.UserRepository
	clubs         *repository.ClubRepository
	emailSender   *EmailSenderService
	notifications *NotificationService // nil disables notification fan-out
	acceptURL     string
	log           zerolog.Logger
}

func NewEventInvitationService(
	invitations *repository.EventInvitationRepository,
	events *repository.EventRepository,
	users *repository.UserRepository,
	clubs *repository.ClubRepository,
	emailSender *EmailSenderService,
	acceptURL string,
	log zerolog.Logger,
) *EventInvitationService {
	return &EventInvitationService{
		invitations: invitations,
		events:      events,
		users:       users,
		clubs:       clubs,
		emailSender: emailSender,
		acceptURL:   strings.TrimRight(acceptURL, "/"),
		log:         log,
	}
}

// SetNotifications wires notification fan-out. Optional — without it an
// invitation still sends its email, it just doesn't ring the bell in-app.
func (s *EventInvitationService) SetNotifications(n *NotificationService) {
	s.notifications = n
}

// CreateBatchResult captures the outcome of a single invitee in a batch send.
type CreateBatchResult struct {
	InviteeUserID string                 `json:"invitee_user_id"`
	Status        string                 `json:"status"` // "invited" | "skipped" | "error"
	Reason        string                 `json:"reason,omitempty"`
	Invitation    *model.EventInvitation `json:"invitation,omitempty"`
}

// CreateBatch is the owner-only batch invite path. Per-invitee guards are
// applied so a single bad ID doesn't fail the whole batch.
func (s *EventInvitationService) CreateBatch(
	ctx context.Context, slug, inviterID string, in *model.CreateEventInvitationsInput,
) ([]*CreateBatchResult, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != inviterID {
		return nil, ErrNotEventOwner
	}
	if ev.State != model.EventStateDraft && ev.State != model.EventStateOpenForEntries && ev.State != model.EventStateLive {
		return nil, ErrEventNotJoinable
	}
	if len(in.InviteeUserIDs) > EventInvitationBatchLimit {
		return nil, fmt.Errorf("%w: at most %d invitees per request", ErrInvalidEvent, EventInvitationBatchLimit)
	}
	results := make([]*CreateBatchResult, 0, len(in.InviteeUserIDs))
	for _, inviteeID := range in.InviteeUserIDs {
		inviteeID = strings.TrimSpace(inviteeID)
		res := &CreateBatchResult{InviteeUserID: inviteeID}
		if inviteeID == "" {
			res.Status = "skipped"
			res.Reason = "empty user id"
			results = append(results, res)
			continue
		}
		if inviteeID == inviterID {
			res.Status = "skipped"
			res.Reason = "self_invite"
			results = append(results, res)
			continue
		}
		invitee, err := s.users.GetByID(ctx, inviteeID)
		if errors.Is(err, repository.ErrNotFound) {
			res.Status = "error"
			res.Reason = "user not found"
			results = append(results, res)
			continue
		}
		if err != nil {
			s.log.Error().Err(err).Str("invitee_id", inviteeID).Msg("load invitee")
			res.Status = "error"
			res.Reason = "internal"
			results = append(results, res)
			continue
		}
		inv, _, err := s.invitations.Upsert(ctx, ev.ID, inviterID, inviteeID, EventInvitationTTL)
		if err != nil {
			s.log.Error().Err(err).Str("invitee_id", inviteeID).Msg("upsert invitation")
			res.Status = "error"
			res.Reason = "internal"
			results = append(results, res)
			continue
		}
		res.Status = "invited"
		res.Invitation = inv

		if s.notifications != nil {
			tid, tt := ev.ID, "event"
			s.notifications.Fanout(ctx, NotifEvent{
				RecipientID: inviteeID,
				ActorID:     inviterID,
				Type:        model.NotificationTypeEventInvitation,
				TargetID:    &tid,
				TargetType:  &tt,
				ClubID:      ev.ClubID,
				Metadata: map[string]any{
					"event_name": ev.Name,
					"event_slug": ev.Slug,
				},
			})
		}

		// Best-effort email; failures don't fail the row.
		go s.sendInvitationEmail(context.Background(), ev, inviterID, invitee, inv.Token)

		results = append(results, res)
	}
	return results, nil
}

func (s *EventInvitationService) sendInvitationEmail(ctx context.Context, ev *model.Event, inviterID string, invitee *model.User, token string) {
	if s.emailSender == nil {
		return
	}
	// The invitation has its own template (it carries the accept link), so
	// NotificationService suppresses the generic email for this type. That
	// makes this send the one the event_invitation_email preference gates.
	if s.notifications != nil {
		prefs, err := s.notifications.GetPreferences(ctx, invitee.ID)
		if err == nil && prefs != nil && !prefs.EmailEnabledForType(model.NotificationTypeEventInvitation) {
			return
		}
	}
	inviter, err := s.users.GetByID(ctx, inviterID)
	if err != nil {
		s.log.Warn().Err(err).Msg("event invitation email: load inviter")
		return
	}
	link := fmt.Sprintf("%s/%s", s.acceptURL, token)
	startsAt := ""
	if ev.StartsAt != nil {
		startsAt = ev.StartsAt.UTC().Format("2 January 2006 at 15:04 UTC")
	}
	location := ""
	if ev.Location != nil {
		location = *ev.Location
	}
	if err := s.emailSender.SendEventInvitation(ctx, invitee.Email, invitee.DisplayName, inviter.DisplayName, ev.Name, startsAt, location, link); err != nil {
		s.log.Warn().Err(err).Str("invitee_id", invitee.ID).Msg("send event invitation email")
	}
}

// Get returns a full view (event + actors) for an invitation by token, for
// the accept page. Status is auto-flipped to expired if past expires_at.
// The viewer must be the invitee (or the event owner viewing their own send).
func (s *EventInvitationService) Get(ctx context.Context, token, viewerID string) (*model.EventInvitationView, error) {
	inv, err := s.invitations.GetByToken(ctx, token)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	if status, err := s.invitations.MarkExpiredIfPast(ctx, inv.ID); err == nil {
		inv.Status = status
	}
	if viewerID != "" && viewerID != inv.InviteeUserID {
		// Allow the inviter (event owner) to fetch their own send for status display.
		if viewerID != inv.InviterUserID {
			return nil, ErrEventForbidden
		}
	}
	ev, err := s.events.GetByID(ctx, inv.EventID)
	if err != nil {
		return nil, err
	}
	inviter, err := s.users.GetByID(ctx, inv.InviterUserID)
	if err != nil {
		return nil, err
	}
	invitee, err := s.users.GetByID(ctx, inv.InviteeUserID)
	if err != nil {
		return nil, err
	}
	return &model.EventInvitationView{
		Invitation: *inv,
		Event: model.EventInvitationEvent{
			ID:         ev.ID,
			Slug:       ev.Slug,
			Name:       ev.Name,
			Discipline: ev.Discipline,
			StartsAt:   ev.StartsAt,
			Location:   ev.Location,
			State:      ev.State,
			ClubID:     ev.ClubID,
		},
		Inviter: model.EventInvitationActor{UserID: inviter.ID, DisplayName: inviter.DisplayName, AvatarURL: inviter.AvatarURL},
		Invitee: model.EventInvitationActor{UserID: invitee.ID, DisplayName: invitee.DisplayName, AvatarURL: invitee.AvatarURL},
	}, nil
}

// Accept marks the invitation accepted and adds the invitee as a participant.
// The viewer must be the invitee. If they're already a participant, the
// invitation is still flipped to accepted (idempotent).
func (s *EventInvitationService) Accept(ctx context.Context, token, viewerID string, eventSvc *EventService) (*model.EventParticipant, error) {
	inv, err := s.invitations.GetByToken(ctx, token)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	if status, err := s.invitations.MarkExpiredIfPast(ctx, inv.ID); err == nil {
		inv.Status = status
	}
	if viewerID == "" || viewerID != inv.InviteeUserID {
		return nil, ErrEventForbidden
	}
	if inv.Status == model.InvitationStatusExpired {
		return nil, ErrInvitationExpired
	}
	if inv.Status == model.InvitationStatusDeclined {
		return nil, ErrInvitationDecided
	}
	ev, err := s.events.GetByID(ctx, inv.EventID)
	if err != nil {
		return nil, err
	}
	in := &model.JoinEventInput{}
	p, joinErr := eventSvc.Join(ctx, ev.Slug, viewerID, in)
	// If they're already a participant, swallow the conflict and still mark accepted.
	if joinErr != nil && !errors.Is(joinErr, ErrAlreadyEventParticipant) {
		return nil, joinErr
	}
	if err := s.invitations.SetStatus(ctx, inv.ID, model.InvitationStatusAccepted); err != nil {
		s.log.Warn().Err(err).Msg("set invitation status accepted")
	}
	return p, nil
}

// Decline marks the invitation declined. Idempotent for already-declined
// invitations; rejects accepted/expired ones.
func (s *EventInvitationService) Decline(ctx context.Context, token, viewerID string) error {
	inv, err := s.invitations.GetByToken(ctx, token)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrInvitationNotFound
	}
	if err != nil {
		return err
	}
	if status, err := s.invitations.MarkExpiredIfPast(ctx, inv.ID); err == nil {
		inv.Status = status
	}
	if viewerID == "" || viewerID != inv.InviteeUserID {
		return ErrEventForbidden
	}
	switch inv.Status {
	case model.InvitationStatusDeclined:
		return nil
	case model.InvitationStatusAccepted, model.InvitationStatusExpired:
		return ErrInvitationDecided
	}
	return s.invitations.SetStatus(ctx, inv.ID, model.InvitationStatusDeclined)
}

// ListByEvent is owner-only.
func (s *EventInvitationService) ListByEvent(ctx context.Context, slug, viewerID string) ([]*model.EventInvitationListItem, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != viewerID {
		return nil, ErrNotEventOwner
	}
	return s.invitations.ListByEvent(ctx, ev.ID)
}

// PotentialInvitees returns the audience for the invite step. Owner-only.
// Validates source against the event's ownership (club_id required for "club").
func (s *EventInvitationService) PotentialInvitees(
	ctx context.Context, slug, viewerID, source, q string, limit int,
) ([]*model.PotentialInvitee, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != viewerID {
		return nil, ErrNotEventOwner
	}
	clubID := ""
	if ev.ClubID != nil {
		clubID = *ev.ClubID
	}
	switch source {
	case model.PotentialInviteeSourceClub:
		if clubID == "" {
			return nil, fmt.Errorf("%w: event has no club", ErrInvalidEvent)
		}
	case model.PotentialInviteeSourceFollowers, model.PotentialInviteeSourceFollowing, model.PotentialInviteeSourceSearch:
	default:
		return nil, fmt.Errorf("%w: unknown source", ErrInvalidEvent)
	}
	return s.invitations.PotentialInvitees(ctx, ev.ID, viewerID, source, clubID, q, limit)
}
