package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	// ErrAnnouncementInvalid carries a field-level message handlers surface
	// verbatim as a 422, so the composer can point at what's wrong.
	ErrAnnouncementInvalid  = errors.New("invalid announcement")
	ErrAnnouncementNotFound = errors.New("announcement not found")
	// ErrAnnouncementForbidden is the refusal for someone who may not send to
	// this audience, or may not read an announcement they were never sent.
	ErrAnnouncementForbidden = errors.New("not authorised for this announcement")
)

// AnnouncementScope names one audience: the platform, or a specific league,
// club or event. ID is empty for the platform.
type AnnouncementScope struct {
	Kind string
	ID   string
}

// AnnouncementAudienceRepo resolves each scope's recipient list.
type AnnouncementAudienceRepo interface {
	ListAllUserIDs(ctx context.Context) ([]string, error)
}

type AnnouncementService struct {
	repo          *repository.AnnouncementRepository
	notifications *repository.NotificationRepository
	fanout        *NotificationService
	users         AnnouncementAudienceRepo
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	events        *repository.EventRepository
}

func NewAnnouncementService(
	repo *repository.AnnouncementRepository,
	notifications *repository.NotificationRepository,
	fanout *NotificationService,
	users AnnouncementAudienceRepo,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	events *repository.EventRepository,
) *AnnouncementService {
	return &AnnouncementService{
		repo:          repo,
		notifications: notifications,
		fanout:        fanout,
		users:         users,
		leagues:       leagues,
		clubs:         clubs,
		events:        events,
	}
}

// Send authorises the sender for the scope, records the announcement, and
// hands the delivery to NotificationService.
//
// isPlatformAdmin comes from the caller's `users.role`; it is the only way to
// send to the platform scope, and it does not stand in for a league or club
// capability — a site admin who wants to address one league is still not that
// league's moderator, and should say so through its owner.
func (s *AnnouncementService) Send(
	ctx context.Context, scope AnnouncementScope, senderID string, isPlatformAdmin bool, in *model.CreateAnnouncementInput,
) (*model.Announcement, error) {
	if msg := in.Normalise(); msg != "" {
		return nil, fmt.Errorf("%w: %s", ErrAnnouncementInvalid, msg)
	}

	a := &model.Announcement{
		Scope:     scope.Kind,
		CreatedBy: senderID,
		Title:     in.Title,
		Body:      in.Body,
		EmailSent: in.SendEmail,
	}

	audience, err := s.authoriseAndResolve(ctx, scope, senderID, isPlatformAdmin, a)
	if err != nil {
		return nil, err
	}

	// Nobody is told about their own announcement.
	recipients := make([]string, 0, len(audience))
	for _, id := range audience {
		if id != "" && id != senderID {
			recipients = append(recipients, id)
		}
	}
	a.RecipientCount = len(recipients)

	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	s.fanout.FanoutAnnouncement(a, recipients)
	return a, nil
}

// authoriseAndResolve checks the sender may address the scope and returns its
// audience, filling the announcement's scope columns and name on the way.
func (s *AnnouncementService) authoriseAndResolve(
	ctx context.Context, scope AnnouncementScope, senderID string, isPlatformAdmin bool, a *model.Announcement,
) ([]string, error) {
	switch scope.Kind {
	case model.AnnouncementScopePlatform:
		if !isPlatformAdmin {
			return nil, ErrAnnouncementForbidden
		}
		return s.users.ListAllUserIDs(ctx)

	case model.AnnouncementScopeLeague:
		role, err := s.leagues.GetMemberRole(ctx, scope.ID, senderID)
		if err != nil {
			return nil, err
		}
		if !role.Can(model.PermSendAnnouncements) {
			return nil, ErrAnnouncementForbidden
		}
		league, err := s.leagues.GetByID(ctx, scope.ID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrLeagueNotFound
		}
		if err != nil {
			return nil, err
		}
		a.LeagueID = &scope.ID
		a.ScopeName = league.Name
		return s.leagues.ListMemberIDs(ctx, scope.ID)

	case model.AnnouncementScopeClub:
		role, err := s.clubs.GetMemberRole(ctx, scope.ID, senderID)
		if err != nil {
			return nil, err
		}
		if !role.Can(model.PermSendAnnouncements) {
			return nil, ErrAnnouncementForbidden
		}
		club, err := s.clubs.GetByID(ctx, scope.ID, senderID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrClubNotFound
		}
		if err != nil {
			return nil, err
		}
		a.ClubID = &scope.ID
		a.ScopeName = club.Name
		return s.clubs.ListMemberIDs(ctx, scope.ID)

	case model.AnnouncementScopeEvent:
		// An event has no capability catalogue — its owner runs it, and
		// delegated scorers are trusted with cards, not with the megaphone.
		ev, err := s.events.GetBySlug(ctx, scope.ID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrEventNotFound
		}
		if err != nil {
			return nil, err
		}
		if ev.OwnerUserID != senderID {
			return nil, ErrAnnouncementForbidden
		}
		a.EventID = &ev.ID
		a.ScopeName = ev.Name
		a.EventSlug = ev.Slug
		return s.events.ListParticipantUserIDs(ctx, ev.ID)
	}
	return nil, fmt.Errorf("%w: unknown scope", ErrAnnouncementInvalid)
}

// List returns a scope's sent announcements. Reading the log of what has been
// broadcast is the sender's view, so it takes the same authorisation as
// sending — otherwise a private club's announcements would be readable by
// anyone who knows its id.
func (s *AnnouncementService) List(
	ctx context.Context, scope AnnouncementScope, viewerID string, isPlatformAdmin bool, limit int,
) ([]*model.Announcement, error) {
	if err := s.authoriseRead(ctx, scope, viewerID, isPlatformAdmin); err != nil {
		return nil, err
	}
	scopeID := scope.ID
	if scope.Kind == model.AnnouncementScopeEvent {
		ev, err := s.events.GetBySlug(ctx, scope.ID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrEventNotFound
		}
		if err != nil {
			return nil, err
		}
		scopeID = ev.ID
	}
	return s.repo.ListForScope(ctx, scope.Kind, scopeID, limit)
}

// authoriseRead lets a group's members read its announcement log, and anyone
// read the platform's. Sending stays gated on the capability.
func (s *AnnouncementService) authoriseRead(ctx context.Context, scope AnnouncementScope, viewerID string, isPlatformAdmin bool) error {
	switch scope.Kind {
	case model.AnnouncementScopePlatform:
		return nil
	case model.AnnouncementScopeLeague:
		role, err := s.leagues.GetMemberRole(ctx, scope.ID, viewerID)
		if err != nil {
			return err
		}
		if !role.IsMember && !isPlatformAdmin {
			return ErrAnnouncementForbidden
		}
		return nil
	case model.AnnouncementScopeClub:
		role, err := s.clubs.GetMemberRole(ctx, scope.ID, viewerID)
		if err != nil {
			return err
		}
		if !role.IsMember && !isPlatformAdmin {
			return ErrAnnouncementForbidden
		}
		return nil
	case model.AnnouncementScopeEvent:
		ev, err := s.events.GetBySlug(ctx, scope.ID)
		if errors.Is(err, repository.ErrNotFound) {
			return ErrEventNotFound
		}
		if err != nil {
			return err
		}
		if ev.OwnerUserID == viewerID || isPlatformAdmin {
			return nil
		}
		ids, err := s.events.ListParticipantUserIDs(ctx, ev.ID)
		if err != nil {
			return err
		}
		for _, id := range ids {
			if id == viewerID {
				return nil
			}
		}
		return ErrAnnouncementForbidden
	}
	return fmt.Errorf("%w: unknown scope", ErrAnnouncementInvalid)
}

// Get returns one announcement to somebody entitled to read it. Having been
// sent it *is* the entitlement — the notification row is the record of that —
// so a reader who left the club afterwards can still open the message they
// were given, and one who joined later cannot read backwards through it.
func (s *AnnouncementService) Get(ctx context.Context, id, viewerID string, isPlatformAdmin bool) (*model.Announcement, error) {
	a, err := s.repo.GetByID(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrAnnouncementNotFound
	}
	if err != nil {
		return nil, err
	}
	if a.CreatedBy == viewerID || isPlatformAdmin {
		return a, nil
	}
	received, err := s.notifications.HasNotificationForTarget(ctx, viewerID, id)
	if err != nil {
		return nil, err
	}
	if !received {
		return nil, ErrAnnouncementForbidden
	}
	return a, nil
}
