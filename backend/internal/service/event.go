package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrEventNotFound          = errors.New("event not found")
	ErrInvalidEvent           = errors.New("invalid event")
	ErrNotEventOwner          = errors.New("not the event owner")
	ErrNotEventScorer         = errors.New("not authorised to score this event")
	ErrAlreadyEventParticipant = errors.New("already a participant of this event")
	ErrEventNotJoinable       = errors.New("event is not open for entries")
	ErrInvalidEventState      = errors.New("invalid event state transition")
	ErrEventForbidden         = errors.New("not authorised to view this event")
)

// allowedTransitions encodes the event state machine. archived is reachable
// only via the daily sweep, never via user action. complete → live exists so
// an owner can reopen an event closed by mistake; the Reopen path also clears
// archive_at and skips re-broadcasting "went live".
var allowedTransitions = map[string]map[string]struct{}{
	model.EventStateDraft:          {model.EventStateOpenForEntries: {}},
	model.EventStateOpenForEntries: {model.EventStateLive: {}, model.EventStateDraft: {}},
	model.EventStateLive:           {model.EventStateComplete: {}},
	model.EventStateComplete:       {model.EventStateLive: {}},
}

// EventArchiveAfter is the grace window between completion and auto-archive.
const EventArchiveAfter = 30 * 24 * time.Hour

// ScoreVerificationRepo is the subset of the league repository's score-card
// audit API that doesn't depend on league context. The event service uses it
// to confirm / amend / reject benchrest cards while sharing the underlying
// score_confirmations and score_card_actions tables.
type ScoreVerificationRepo interface {
	ConfirmScore(ctx context.Context, scoreCardID, userID string) (*model.ScoreConfirmation, error)
	GetConfirmationCount(ctx context.Context, scoreCardID string) (int, error)
	UpdateScoreVerification(ctx context.Context, scoreCardID, status string) error
	AmendScore(ctx context.Context, scoreCardID, adminID string, input *model.AmendScoreInput) error
	RejectScore(ctx context.Context, scoreCardID, adminID string, input *model.RejectScoreInput) error
	GetScoreCardOwner(ctx context.Context, scoreCardID string) (string, error)
}

// CardReader exposes the score-card lookup needed by event-side verification.
type CardReader interface {
	GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error)
}

type EventService struct {
	events       *repository.EventRepository
	clubs        *repository.ClubRepository
	categories   *repository.CategoryRepository
	activity     *ActivityService
	achievements *AchievementService
	verifyRepo   ScoreVerificationRepo
	cardReader   CardReader
}

func NewEventService(
	events *repository.EventRepository,
	clubs *repository.ClubRepository,
	categories *repository.CategoryRepository,
	activity *ActivityService,
	achievements *AchievementService,
) *EventService {
	return &EventService{
		events:       events,
		clubs:        clubs,
		categories:   categories,
		activity:     activity,
		achievements: achievements,
	}
}

// SetCardVerificationDeps wires the score-card audit repo and the card reader
// used by ConfirmCard / AmendCard / RejectCard. Optional; when unset, the
// card-verification endpoints return ErrInvalidEvent.
func (s *EventService) SetCardVerificationDeps(verify ScoreVerificationRepo, cards CardReader) {
	s.verifyRepo = verify
	s.cardReader = cards
}

func (s *EventService) Create(ctx context.Context, ownerID string, in *model.CreateEventInput) (*model.Event, error) {
	if err := validateEventInput(in); err != nil {
		return nil, err
	}
	if in.ClubID != nil && *in.ClubID != "" {
		isAdmin, err := s.clubs.IsAdmin(ctx, *in.ClubID, ownerID)
		if err != nil {
			return nil, err
		}
		if !isAdmin {
			return nil, fmt.Errorf("%w: must be a club admin to host an event in this club", ErrNotAdmin)
		}
	}
	if len(in.CategoryIDs) > 0 {
		ok, err := s.categories.ExistAll(ctx, in.CategoryIDs)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("%w: one or more categories are invalid or inactive", ErrInvalidEvent)
		}
	}
	ev, err := s.events.Create(ctx, ownerID, in)
	if err != nil {
		return nil, err
	}

	// Fan out event_created activity. Owner always; club_id when set.
	if s.activity != nil {
		clubID := ev.ClubID
		var clubName string
		if clubID != nil {
			if c, _ := s.clubs.GetByID(ctx, *clubID, ownerID); c != nil {
				clubName = c.Name
			}
		}
		visibility := "public"
		if ev.Visibility == model.EventVisibilityClubOnly {
			visibility = "followers" // matches club-only feed semantics
		}
		tid, tt := ev.ID, "event"
		meta := model.EventCreatedMeta{
			EventName:  ev.Name,
			EventSlug:  ev.Slug,
			ClubName:   clubName,
			Discipline: ev.Discipline,
		}
		go s.activity.Ingest(context.Background(), ownerID, model.ActivityEventCreated, &tid, &tt, meta, nil, clubID, visibility)
	}
	return ev, nil
}

func validateEventInput(in *model.CreateEventInput) error {
	if strings.TrimSpace(in.Name) == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidEvent)
	}
	if strings.TrimSpace(in.Discipline) == "" {
		return fmt.Errorf("%w: discipline is required", ErrInvalidEvent)
	}
	format := model.EventFormatShotGrid
	if in.Format != nil && *in.Format != "" {
		format = *in.Format
	}
	switch format {
	case model.EventFormatShotGrid, model.EventFormatCardSubmission:
	default:
		return fmt.Errorf("%w: format must be 'shot_grid' or 'card_submission'", ErrInvalidEvent)
	}
	// Lane / shots-per-target only apply to the per-shot tap UI; card_submission
	// uses the score_card 25-shot schema and ignores course geometry.
	if format == model.EventFormatShotGrid {
		if in.Course.Lanes < 1 || in.Course.Lanes > 200 {
			return fmt.Errorf("%w: course.lanes must be 1..200", ErrInvalidEvent)
		}
		if in.Course.ShotsPerTarget < 1 || in.Course.ShotsPerTarget > 10 {
			return fmt.Errorf("%w: course.shots_per_target must be 1..10", ErrInvalidEvent)
		}
	}
	if in.RequiredConfirmations != nil {
		if *in.RequiredConfirmations < 0 || *in.RequiredConfirmations > 10 {
			return fmt.Errorf("%w: required_confirmations must be 0..10", ErrInvalidEvent)
		}
	}
	if in.Visibility != nil {
		switch *in.Visibility {
		case model.EventVisibilityPublic, model.EventVisibilityClubOnly, model.EventVisibilityUnlisted:
		default:
			return fmt.Errorf("%w: visibility must be 'public', 'club_only' or 'unlisted'", ErrInvalidEvent)
		}
		if *in.Visibility == model.EventVisibilityClubOnly {
			if in.ClubID == nil || strings.TrimSpace(*in.ClubID) == "" {
				return fmt.Errorf("%w: visibility 'club_only' requires a club_id", ErrInvalidEvent)
			}
		}
	}
	return nil
}

// GetBySlug enforces visibility rules. Site admins bypass all gating.
func (s *EventService) GetBySlug(ctx context.Context, slug, viewerID, viewerRole string) (*model.Event, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	isSiteAdmin := viewerRole == "admin"
	if !isSiteAdmin {
		if ev.Visibility == model.EventVisibilityClubOnly {
			if ev.ClubID == nil {
				return nil, ErrEventNotFound
			}
			if viewerID == "" {
				return nil, ErrUnauthenticated
			}
			isMember, err := s.clubs.IsMember(ctx, *ev.ClubID, viewerID)
			if err != nil {
				return nil, err
			}
			if !isMember {
				return nil, ErrEventForbidden
			}
		}
		// 'unlisted' is intentionally accessible to anyone with the slug.
	}
	if viewerID != "" {
		ev.IsOwner = ev.OwnerUserID == viewerID
		if !ev.IsOwner {
			scorer, err := s.events.IsScorer(ctx, ev.ID, viewerID)
			if err == nil {
				ev.IsScorer = scorer
			}
		} else {
			ev.IsScorer = true
		}
	}
	return ev, nil
}

// List returns events visible to the viewer. clubID may be empty.
func (s *EventService) List(ctx context.Context, viewerID, viewerRole, stateFilter, clubID string) ([]*model.Event, error) {
	if clubID != "" {
		// Club listings include club_only events; gate on membership.
		if viewerRole != "admin" {
			if viewerID == "" {
				return nil, ErrUnauthenticated
			}
			isMember, err := s.clubs.IsMember(ctx, clubID, viewerID)
			if err != nil {
				return nil, err
			}
			if !isMember {
				return nil, ErrEventForbidden
			}
		}
		items, err := s.events.ListByClub(ctx, clubID)
		if err != nil {
			return nil, err
		}
		if stateFilter != "" {
			out := items[:0]
			for _, e := range items {
				if e.State == stateFilter {
					out = append(out, e)
				}
			}
			items = out
		}
		return items, nil
	}
	return s.events.List(ctx, viewerID, stateFilter)
}

func (s *EventService) ListByUser(ctx context.Context, userID string) ([]*model.MyEventSummary, error) {
	return s.events.ListByUser(ctx, userID)
}

func (s *EventService) Update(ctx context.Context, slug, userID string, in *model.UpdateEventInput) (*model.Event, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != userID {
		return nil, ErrNotEventOwner
	}
	if in.CategoryIDs != nil && len(*in.CategoryIDs) > 0 {
		ok, err := s.categories.ExistAll(ctx, *in.CategoryIDs)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("%w: one or more categories are invalid or inactive", ErrInvalidEvent)
		}
	}
	if in.Visibility != nil {
		switch *in.Visibility {
		case model.EventVisibilityPublic, model.EventVisibilityClubOnly, model.EventVisibilityUnlisted:
		default:
			return nil, fmt.Errorf("%w: visibility must be 'public', 'club_only' or 'unlisted'", ErrInvalidEvent)
		}
	}
	updated, err := s.events.Update(ctx, ev.ID, in)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	return updated, err
}

// Promote transitions the event to the requested state. Validates the
// transition against allowedTransitions; the daily sweep handles archival.
// The complete → live edge is the "reopen" path: it clears archive_at and
// suppresses the went-live activity so reopens don't double-post.
func (s *EventService) Promote(ctx context.Context, slug, userID, target string) (*model.Event, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != userID {
		return nil, ErrNotEventOwner
	}
	allowed := allowedTransitions[ev.State]
	if _, ok := allowed[target]; !ok {
		return nil, fmt.Errorf("%w: cannot move from %s to %s", ErrInvalidEventState, ev.State, target)
	}
	prevState := ev.State
	isReopen := target == model.EventStateLive && prevState == model.EventStateComplete
	if isReopen {
		if err := s.events.Reopen(ctx, ev.ID); err != nil {
			return nil, err
		}
	} else {
		var archiveAt *time.Time
		if target == model.EventStateComplete {
			t := time.Now().Add(EventArchiveAfter)
			archiveAt = &t
		}
		if err := s.events.SetState(ctx, ev.ID, target, archiveAt); err != nil {
			return nil, err
		}
	}
	updated, err := s.events.GetByID(ctx, ev.ID)
	if err != nil {
		return nil, err
	}
	switch target {
	case model.EventStateLive:
		if !isReopen {
			s.fanOutWentLive(ctx, updated)
		}
	case model.EventStateComplete:
		s.handleCompletion(ctx, updated)
	}
	return updated, nil
}

func (s *EventService) fanOutWentLive(ctx context.Context, ev *model.Event) {
	if s.activity == nil {
		return
	}
	clubName := s.lookupClubName(ctx, ev)
	tid, tt := ev.ID, "event"
	meta := model.EventWentLiveMeta{EventName: ev.Name, EventSlug: ev.Slug, ClubName: clubName}
	visibility := "public"
	if ev.Visibility == model.EventVisibilityClubOnly {
		visibility = "followers"
	}
	go s.activity.Ingest(context.Background(), ev.OwnerUserID, model.ActivityEventWentLive, &tid, &tt, meta, nil, ev.ClubID, visibility)
}

// handleCompletion is the heaviest lifecycle hook: it computes final standings,
// fans out per-participant feed entries, posts a single owner-authored
// aggregate naming the winner and per-band winners, and triggers achievement
// evaluation. Idempotent across reopen → re-complete cycles via the
// HasCompletionActivity guard.
func (s *EventService) handleCompletion(ctx context.Context, ev *model.Event) {
	if has, err := s.events.HasCompletionActivity(ctx, ev.ID); err == nil && has {
		return
	}
	var standings []*model.EventStandingRow
	var err error
	if ev.Format == model.EventFormatCardSubmission {
		standings, err = s.events.StandingsFromCards(ctx, ev.ID)
	} else {
		standings, err = s.events.Standings(ctx, ev.ID, ev.ScoringRules)
	}
	if err != nil {
		return
	}
	clubName := s.lookupClubName(ctx, ev)

	if s.activity != nil {
		tid, tt := ev.ID, "event"
		visibility := "public"
		if ev.Visibility == model.EventVisibilityClubOnly {
			visibility = "followers"
		}
		for _, row := range standings {
			if row.UserID == nil {
				continue // skip guests — no feed entry for non-account participants
			}
			meta := model.EventCompletedMeta{
				EventName:     ev.Name,
				EventSlug:     ev.Slug,
				ClubName:      clubName,
				Position:      row.Position,
				Points:        row.Points,
				HitCount:      row.HitCount,
				ShotsRecorded: row.ShotsRecorded,
				CategoryLabel: derefString(row.CategoryLabel),
			}
			uid := *row.UserID
			go s.activity.Ingest(context.Background(), uid, model.ActivityEventCompletedWithResults, &tid, &tt, meta, nil, ev.ClubID, visibility)
		}
		aggregate := buildEventResultsMeta(ev.Name, ev.Slug, clubName, standings)
		go s.activity.Ingest(context.Background(), ev.OwnerUserID, model.ActivityEventResultsPosted, &tid, &tt, aggregate, nil, ev.ClubID, visibility)
	}
	if s.achievements != nil {
		s.achievements.EvaluateForEventCompletion(ctx, ev, standings)
	}
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// buildEventResultsMeta packages a sorted standings list into the public
// aggregate posted on completion. Standings are assumed pre-sorted by Position.
// Guests are included in the podium (display name is COALESCE'd server-side)
// but their UserID is empty.
func buildEventResultsMeta(name, slug, clubName string, standings []*model.EventStandingRow) model.EventResultsMeta {
	meta := model.EventResultsMeta{
		EventName: name,
		EventSlug: slug,
		ClubName:  clubName,
	}
	if len(standings) == 0 {
		return meta
	}
	winner := podiumEntryFrom(standings[0])
	meta.Winner = &winner

	top := standings
	if len(top) > 3 {
		top = top[:3]
	}
	for _, row := range top {
		meta.Top3 = append(meta.Top3, podiumEntryFrom(row))
	}

	// Per-band winner = lowest Position per non-nil CategoryID. Standings are
	// sorted by points desc, so the first row we see for a band is the winner.
	seen := map[string]struct{}{}
	for _, row := range standings {
		if row.CategoryID == nil || *row.CategoryID == "" {
			continue
		}
		if _, dup := seen[*row.CategoryID]; dup {
			continue
		}
		seen[*row.CategoryID] = struct{}{}
		meta.PerBandWinners = append(meta.PerBandWinners, podiumEntryFrom(row))
	}
	return meta
}

func podiumEntryFrom(row *model.EventStandingRow) model.EventResultsPodiumEntry {
	entry := model.EventResultsPodiumEntry{
		DisplayName:   row.DisplayName,
		CategoryLabel: derefString(row.CategoryLabel),
		Position:      row.Position,
		Points:        row.Points,
		HitCount:      row.HitCount,
		ShotsRecorded: row.ShotsRecorded,
	}
	if row.UserID != nil {
		entry.UserID = *row.UserID
	}
	return entry
}

func (s *EventService) lookupClubName(ctx context.Context, ev *model.Event) string {
	if ev.ClubID == nil {
		return ""
	}
	c, err := s.clubs.GetByID(ctx, *ev.ClubID, ev.OwnerUserID)
	if err != nil || c == nil {
		return ""
	}
	return c.Name
}

// Join adds the caller as a registered participant. Only allowed in
// 'open_for_entries' or 'live' state.
func (s *EventService) Join(ctx context.Context, slug, userID string, in *model.JoinEventInput) (*model.EventParticipant, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.State != model.EventStateOpenForEntries && ev.State != model.EventStateLive {
		return nil, ErrEventNotJoinable
	}
	if ev.Visibility == model.EventVisibilityClubOnly && ev.ClubID != nil {
		isMember, err := s.clubs.IsMember(ctx, *ev.ClubID, userID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrNotClubMember
		}
	}
	if in.CategoryID != nil && *in.CategoryID != "" {
		if !contains(ev.CategoryIDs, *in.CategoryID) {
			return nil, fmt.Errorf("%w: category is not enabled for this event", ErrInvalidEvent)
		}
	}
	p, err := s.events.AddRegisteredParticipant(ctx, ev.ID, userID, userID, in)
	if errors.Is(err, repository.ErrConflict) {
		return nil, ErrAlreadyEventParticipant
	}
	if err != nil {
		return nil, err
	}
	if s.activity != nil {
		tid, tt := ev.ID, "event"
		clubName := s.lookupClubName(ctx, ev)
		meta := model.EventJoinedMeta{EventName: ev.Name, EventSlug: ev.Slug, ClubName: clubName}
		visibility := "public"
		if ev.Visibility == model.EventVisibilityClubOnly {
			visibility = "followers"
		}
		go s.activity.Ingest(context.Background(), userID, model.ActivityEventJoined, &tid, &tt, meta, nil, ev.ClubID, visibility)
	}
	return p, nil
}

// AddGuest is owner-only. Allowed in any pre-archived state so owners can
// recover from "this guy showed up after sign-up closed" reality.
func (s *EventService) AddGuest(ctx context.Context, slug, ownerID string, in *model.AddGuestInput) (*model.EventParticipant, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.OwnerUserID != ownerID {
		return nil, ErrNotEventOwner
	}
	if strings.TrimSpace(in.GuestName) == "" {
		return nil, fmt.Errorf("%w: guest_name is required", ErrInvalidEvent)
	}
	if in.CategoryID != nil && *in.CategoryID != "" {
		if !contains(ev.CategoryIDs, *in.CategoryID) {
			return nil, fmt.Errorf("%w: category is not enabled for this event", ErrInvalidEvent)
		}
	}
	return s.events.AddGuest(ctx, ev.ID, ownerID, in)
}

func (s *EventService) RemoveParticipant(ctx context.Context, slug, ownerID, participantID string) error {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrEventNotFound
	}
	if err != nil {
		return err
	}
	if ev.OwnerUserID != ownerID {
		return ErrNotEventOwner
	}
	if err := s.events.RemoveParticipant(ctx, ev.ID, participantID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrEventNotFound
		}
		return err
	}
	return nil
}

func (s *EventService) ListParticipants(ctx context.Context, slug string) ([]*model.EventParticipant, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.events.ListParticipants(ctx, ev.ID)
}

func (s *EventService) AddScorer(ctx context.Context, slug, ownerID string, in *model.AddScorerInput) error {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrEventNotFound
	}
	if err != nil {
		return err
	}
	if ev.OwnerUserID != ownerID {
		return ErrNotEventOwner
	}
	if in.UserID == "" {
		return fmt.Errorf("%w: user_id is required", ErrInvalidEvent)
	}
	return s.events.AddScorer(ctx, ev.ID, in.UserID, ownerID)
}

// RecordScores is the offline-outbox flush endpoint. Caller must be a scorer.
func (s *EventService) RecordScores(ctx context.Context, slug, userID string, in *model.RecordScoresInput) (int, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return 0, ErrEventNotFound
	}
	if err != nil {
		return 0, err
	}
	if ev.State == model.EventStateArchived || ev.State == model.EventStateComplete {
		return 0, fmt.Errorf("%w: event is closed", ErrInvalidEventState)
	}
	allowed, err := s.events.IsScorer(ctx, ev.ID, userID)
	if err != nil {
		return 0, err
	}
	if !allowed {
		return 0, ErrNotEventScorer
	}
	for i, sc := range in.Scores {
		if sc.ParticipantID == "" || sc.Result == "" || sc.ClientID == "" || sc.Lane < 1 {
			return 0, fmt.Errorf("%w: score[%d] missing required fields", ErrInvalidEvent, i)
		}
	}
	return s.events.UpsertScores(ctx, ev.ID, userID, in.Scores)
}

// ListScores returns every per-shot result for an event so the scorecard can
// hydrate its local state on reload. Visibility mirrors the scoreboard.
func (s *EventService) ListScores(ctx context.Context, slug string) ([]*model.EventScore, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.events.ListScoresForCSV(ctx, ev.ID)
}

func (s *EventService) Standings(ctx context.Context, slug string) ([]*model.EventStandingRow, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	if err != nil {
		return nil, err
	}
	if ev.Format == model.EventFormatCardSubmission {
		return s.events.StandingsFromCards(ctx, ev.ID)
	}
	return s.events.Standings(ctx, ev.ID, ev.ScoringRules)
}

// ListEventCards returns the per-participant card status for a card_submission
// event. Public read; visibility mirrors the scoreboard.
func (s *EventService) ListEventCards(ctx context.Context, slug string) (*model.Event, []*model.EventCardStatus, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	items, err := s.events.ListEventCards(ctx, ev.ID)
	if err != nil {
		return nil, nil, err
	}
	return ev, items, nil
}

// EnsureCanSubmitCardForParticipant returns nil when userID is allowed to
// submit/refine a card for the given participant: either the participant is a
// registered user matching userID, or userID is the event owner or a delegated
// scorer. Used by the score-card service when an event_participant_id is
// supplied. Caller must have already loaded ev/p from the repository.
func (s *EventService) EnsureCanSubmitCardForParticipant(ctx context.Context, ev *model.Event, p *model.EventParticipant, userID string) error {
	if userID == "" {
		return ErrUnauthenticated
	}
	if p.UserID != nil && *p.UserID == userID {
		return nil
	}
	allowed, err := s.events.IsScorer(ctx, ev.ID, userID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrNotEventScorer
	}
	return nil
}

// EnsureCanVerifyEventCard returns nil when userID can confirm/amend/reject a
// submitted card. Owner + delegated scorers only.
func (s *EventService) EnsureCanVerifyEventCard(ctx context.Context, ev *model.Event, userID string) error {
	if userID == "" {
		return ErrUnauthenticated
	}
	allowed, err := s.events.IsScorer(ctx, ev.ID, userID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrNotEventScorer
	}
	return nil
}

// LookupParticipantWithEvent returns the participant and its event. Used by
// the score-card service to validate cross-event submissions in one trip.
func (s *EventService) LookupParticipantWithEvent(ctx context.Context, participantID string) (*model.Event, *model.EventParticipant, error) {
	p, err := s.events.GetParticipant(ctx, participantID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	ev, err := s.events.GetByID(ctx, p.EventID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	return ev, p, nil
}

// LoadEventBySlug exposes a slug→event lookup for sibling services that need
// to read event flags (e.g. score_card service consulting verification config).
func (s *EventService) LoadEventBySlug(ctx context.Context, slug string) (*model.Event, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrEventNotFound
	}
	return ev, err
}

// loadEventCard loads the card and event, asserts the card belongs to a
// participant in this event, and returns both. Used by Confirm / Amend /
// Reject before delegating to the verification repository.
func (s *EventService) loadEventCard(ctx context.Context, slug, scoreCardID string) (*model.Event, *model.ScoreCard, error) {
	if s.verifyRepo == nil || s.cardReader == nil {
		return nil, nil, fmt.Errorf("%w: card verification not enabled", ErrInvalidEvent)
	}
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	card, err := s.cardReader.GetPublicByID(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if card.EventParticipantID == nil || *card.EventParticipantID == "" {
		return nil, nil, fmt.Errorf("%w: card is not linked to any event", ErrInvalidEvent)
	}
	p, err := s.events.GetParticipant(ctx, *card.EventParticipantID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if p.EventID != ev.ID {
		return nil, nil, fmt.Errorf("%w: card belongs to a different event", ErrInvalidEvent)
	}
	return ev, card, nil
}

// ConfirmCard records a peer confirmation for an event-bound score card. When
// the event's required-confirmation threshold is reached, flips verification
// to 'verified'. Caller must be the event owner or a delegated scorer.
func (s *EventService) ConfirmCard(ctx context.Context, slug, scoreCardID, userID string) error {
	ev, card, err := s.loadEventCard(ctx, slug, scoreCardID)
	if err != nil {
		return err
	}
	if err := s.EnsureCanVerifyEventCard(ctx, ev, userID); err != nil {
		return err
	}
	ownerID, err := s.verifyRepo.GetScoreCardOwner(ctx, card.ID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrEventNotFound
	}
	if err != nil {
		return err
	}
	if ownerID == userID {
		return fmt.Errorf("%w: cannot confirm your own submission", ErrInvalidEvent)
	}
	if _, err := s.verifyRepo.ConfirmScore(ctx, card.ID, userID); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return fmt.Errorf("%w: already confirmed", ErrInvalidEvent)
		}
		return err
	}
	if ev.RequireScoreVerification && ev.RequiredConfirmations > 0 {
		count, err := s.verifyRepo.GetConfirmationCount(ctx, card.ID)
		if err != nil {
			return err
		}
		if count >= int(ev.RequiredConfirmations) {
			if err := s.verifyRepo.UpdateScoreVerification(ctx, card.ID, "verified"); err != nil {
				return err
			}
		}
	}
	return nil
}

// AmendCard rewrites a submitted card's total/x-count and records an audit
// row. Owner or delegated scorers only.
func (s *EventService) AmendCard(ctx context.Context, slug, scoreCardID, userID string, in *model.AmendScoreInput) error {
	if in.NewTotalScore < 0 || in.NewTotalScore > 250 {
		return fmt.Errorf("%w: new_total_score must be 0-250", ErrInvalidEvent)
	}
	if in.NewXCount < 0 || in.NewXCount > 25 {
		return fmt.Errorf("%w: new_x_count must be 0-25", ErrInvalidEvent)
	}
	ev, card, err := s.loadEventCard(ctx, slug, scoreCardID)
	if err != nil {
		return err
	}
	if err := s.EnsureCanVerifyEventCard(ctx, ev, userID); err != nil {
		return err
	}
	return s.verifyRepo.AmendScore(ctx, card.ID, userID, in)
}

// RejectCard flips the card's verification to 'rejected' with an audit reason.
// Owner or delegated scorers only.
func (s *EventService) RejectCard(ctx context.Context, slug, scoreCardID, userID string, in *model.RejectScoreInput) error {
	if in.Reason == "" {
		return fmt.Errorf("%w: reason is required", ErrInvalidEvent)
	}
	ev, card, err := s.loadEventCard(ctx, slug, scoreCardID)
	if err != nil {
		return err
	}
	if err := s.EnsureCanVerifyEventCard(ctx, ev, userID); err != nil {
		return err
	}
	return s.verifyRepo.RejectScore(ctx, card.ID, userID, in)
}

func (s *EventService) ListScoresForCSV(ctx context.Context, slug string) (*model.Event, []*model.EventParticipant, []*model.EventScore, error) {
	ev, err := s.events.GetBySlug(ctx, slug)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, nil, ErrEventNotFound
	}
	if err != nil {
		return nil, nil, nil, err
	}
	parts, err := s.events.ListParticipants(ctx, ev.ID)
	if err != nil {
		return nil, nil, nil, err
	}
	scores, err := s.events.ListScoresForCSV(ctx, ev.ID)
	if err != nil {
		return nil, nil, nil, err
	}
	return ev, parts, scores, nil
}

// AdminListEvents returns every event on the platform, joined with club name
// and owner display name. Caller must already be a platform admin (gated by
// middleware.RequireAdmin in the router).
func (s *EventService) AdminListEvents(ctx context.Context) ([]*repository.AdminEventRow, error) {
	return s.events.AdminListAll(ctx)
}

// AdminDeleteEvent hard-deletes an event by ID without ownership checks.
func (s *EventService) AdminDeleteEvent(ctx context.Context, id string) error {
	err := s.events.AdminDelete(ctx, id)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrEventNotFound
	}
	return err
}

// RunArchiveSweep flips completed events whose 30-day archive window has
// elapsed into 'archived'. Intended to run on a daily ticker from main.
func (s *EventService) RunArchiveSweep(ctx context.Context) (int, error) {
	return s.events.ArchiveSweep(ctx, time.Now())
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}
