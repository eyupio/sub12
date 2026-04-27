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
// only via the daily sweep, never via user action.
var allowedTransitions = map[string]map[string]struct{}{
	model.EventStateDraft:           {model.EventStateOpenForEntries: {}},
	model.EventStateOpenForEntries:  {model.EventStateLive: {}, model.EventStateDraft: {}},
	model.EventStateLive:            {model.EventStateComplete: {}},
}

// EventArchiveAfter is the grace window between completion and auto-archive.
const EventArchiveAfter = 30 * 24 * time.Hour

type EventService struct {
	events       *repository.EventRepository
	clubs        *repository.ClubRepository
	categories   *repository.CategoryRepository
	activity     *ActivityService
	achievements *AchievementService
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
	if in.Course.Lanes < 1 || in.Course.Lanes > 200 {
		return fmt.Errorf("%w: course.lanes must be 1..200", ErrInvalidEvent)
	}
	if in.Course.ShotsPerTarget < 1 || in.Course.ShotsPerTarget > 10 {
		return fmt.Errorf("%w: course.shots_per_target must be 1..10", ErrInvalidEvent)
	}
	if in.Visibility != nil {
		switch *in.Visibility {
		case model.EventVisibilityPublic, model.EventVisibilityClubOnly, model.EventVisibilityUnlisted:
		default:
			return fmt.Errorf("%w: visibility must be 'public', 'club_only' or 'unlisted'", ErrInvalidEvent)
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
	var archiveAt *time.Time
	if target == model.EventStateComplete {
		t := time.Now().Add(EventArchiveAfter)
		archiveAt = &t
	}
	if err := s.events.SetState(ctx, ev.ID, target, archiveAt); err != nil {
		return nil, err
	}
	updated, err := s.events.GetByID(ctx, ev.ID)
	if err != nil {
		return nil, err
	}
	switch target {
	case model.EventStateLive:
		s.fanOutWentLive(ctx, updated)
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
// fans out per-participant feed entries, and triggers achievement evaluation
// for every registered participant plus the host.
func (s *EventService) handleCompletion(ctx context.Context, ev *model.Event) {
	standings, err := s.events.Standings(ctx, ev.ID, ev.ScoringRules)
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
			}
			uid := *row.UserID
			go s.activity.Ingest(context.Background(), uid, model.ActivityEventCompletedWithResults, &tid, &tt, meta, nil, ev.ClubID, visibility)
		}
	}
	if s.achievements != nil {
		s.achievements.EvaluateForEventCompletion(ctx, ev, standings)
	}
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
	return s.events.Standings(ctx, ev.ID, ev.ScoringRules)
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
