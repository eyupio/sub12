package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidCard     = errors.New("invalid score card")
	ErrMaxSubmissions  = errors.New("maximum submissions per round reached")
	ErrEditsLocked     = errors.New("score card is locked by league policy")
	ErrNotLeagueMember = errors.New("league membership required")
)

// ScoreCardRepo is implemented by repository.ScoreCardRepository.
type ScoreCardRepo interface {
	Create(ctx context.Context, userID string, input *model.CreateScoreCardInput, totalScore, xCount int16, maxSubmissions int) (*model.ScoreCard, error)
	CreateDraft(ctx context.Context, userID string, input *model.QuickCreateScoreCardInput) (*model.ScoreCard, error)
	Graduate(ctx context.Context, id, userID string, leagueRoundID *string, maxSubmissions int) (*model.ScoreCard, error)
	GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error)
	GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error)
	ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error)
	GetDraftCount(ctx context.Context, userID string) (int, error)
	UpdateImageURL(ctx context.Context, id, userID, imageURL string) error
	UpdateImageRotation(ctx context.Context, id, userID string, rotation int16) (*model.ScoreCard, error)
	Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error)
	Delete(ctx context.Context, id, userID string) error
	IsPersonalBest(ctx context.Context, userID, cardID string, totalScore int16) (bool, error)
	GetPriorScoreStats(ctx context.Context, userID, excludeID string) (*repository.PriorScoreStats, error)
	GetGearLabels(ctx context.Context, cardID string) (string, string, error)
	SubmitToLeague(ctx context.Context, cardID, userID, roundID string) (*model.ScoreCard, error)
	SetVerification(ctx context.Context, id, verification string) error
	GetExistingCardForParticipant(ctx context.Context, eventParticipantID string) (*model.ScoreCard, error)
}

// LeagueConfigRepo provides league config lookups needed by ScoreCardService.
type LeagueConfigRepo interface {
	GetConfigByRoundID(ctx context.Context, roundID string) (*model.LeagueConfig, error)
	CountUserSubmissionsForRound(ctx context.Context, userID, roundID string) (int, error)
	GetLeagueIDByRoundID(ctx context.Context, roundID string) (string, error)
	GetByID(ctx context.Context, id string) (*model.League, error)
	IsMember(ctx context.Context, leagueID, userID string) (bool, error)
	RecordOwnerReopen(ctx context.Context, scoreCardID, userID string) error
}

// ClubMembershipRepo answers whether a user belongs to a club, so a card can
// only be re-homed to a club its owner is actually in.
type ClubMembershipRepo interface {
	IsMember(ctx context.Context, clubID, userID string) (bool, error)
}

// UserProfileReader returns the profile-visibility flag needed when deciding
// whether to expose a public item to anonymous viewers.
type UserProfileReader interface {
	GetByID(ctx context.Context, id string) (*model.User, error)
}

type ScoreCardService struct {
	cards       ScoreCardRepo
	leagueRepo  LeagueConfigRepo    // optional; nil skips league rule enforcement
	clubs       ClubMembershipRepo  // optional; nil skips club membership checks
	users       UserProfileReader   // optional; nil skips owner-privacy checks
	events      *EventService       // optional; nil disables event-bound submissions
	activity    *ActivityService    // optional; nil disables feed ingestion
	achievement *AchievementService // optional; nil disables achievement evaluation
	log         zerolog.Logger
}

func NewScoreCardService(cards ScoreCardRepo, leagueRepo LeagueConfigRepo, activity *ActivityService, achievement *AchievementService) *ScoreCardService {
	return &ScoreCardService{cards: cards, leagueRepo: leagueRepo, activity: activity, achievement: achievement}
}

// SetClubRepo wires the club membership lookup used when a card is re-homed
// to a club. Left unset, club changes are accepted without a membership check.
func (s *ScoreCardService) SetClubRepo(clubs ClubMembershipRepo) {
	s.clubs = clubs
}

// SetEventService wires the EventService dependency. Required for event-bound
// score-card submissions; left unset for environments that don't enable events.
func (s *ScoreCardService) SetEventService(events *EventService) {
	s.events = events
}

// SetUserReader wires a user lookup so GetForViewer can enforce the owner's
// profile_visibility when deciding whether to expose a public card.
func (s *ScoreCardService) SetUserReader(users UserProfileReader) {
	s.users = users
}

// SetLogger wires a logger used by background goroutines for panic recovery
// and best-effort failure reporting on activity/achievement ingestion.
func (s *ScoreCardService) SetLogger(log zerolog.Logger) {
	s.log = log
}

// safeGo runs fn in a goroutine, recovering panics so a failure in async
// activity/achievement ingestion cannot crash the API process.
func (s *ScoreCardService) safeGo(name string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.log.Error().Interface("panic", r).Str("task", name).Msg("score_card: background task panicked")
			}
		}()
		fn()
	}()
}

// resolveEventContext validates an event-bound submission. When the input
// references an event_participant_id, we look up the participant and the
// owning event, validate the event's format and live state, and gate on
// submitter permissions. Caller is responsible for overwriting discipline /
// club_id from the returned event so clients can't smuggle inconsistent
// values. Returns (nil, nil) when no event link is present.
func (s *ScoreCardService) resolveEventContext(
	ctx context.Context,
	userID string,
	leagueRoundID, eventParticipantID *string,
) (*model.Event, error) {
	if eventParticipantID == nil || *eventParticipantID == "" {
		return nil, nil
	}
	if leagueRoundID != nil && *leagueRoundID != "" {
		return nil, fmt.Errorf("%w: cannot link a card to both a league round and an event", ErrInvalidCard)
	}
	if s.events == nil {
		return nil, fmt.Errorf("%w: event submissions are not enabled", ErrInvalidCard)
	}
	ev, p, err := s.events.LookupParticipantWithEvent(ctx, *eventParticipantID)
	if err != nil {
		return nil, err
	}
	if ev.Format != model.EventFormatCardSubmission {
		return nil, fmt.Errorf("%w: event does not accept card submissions", ErrInvalidCard)
	}
	if ev.State != model.EventStateLive {
		return nil, fmt.Errorf("%w: event is not live", ErrInvalidCard)
	}
	if err := s.events.EnsureCanSubmitCardForParticipant(ctx, ev, p, userID); err != nil {
		return nil, err
	}
	return ev, nil
}

// applyEventDefaults overwrites the discipline / club_id fields pointed to by
// discipline and clubID with the event's values, so a client cannot store
// mismatched values for an event-bound card. Shared by Create (whose input's
// fields differ in name-only from QuickCreate's) via pointer-to-field.
func applyEventDefaults(discipline, clubID **string, ev *model.Event) {
	if ev.Discipline != "" {
		d := ev.Discipline
		*discipline = &d
	}
	if ev.ClubID != nil {
		c := *ev.ClubID
		*clubID = &c
	}
}

// Create validates the input and persists a new score card.
func (s *ScoreCardService) Create(ctx context.Context, userID string, input *model.CreateScoreCardInput) (*model.ScoreCard, error) {
	if len(input.ShotScores) != 25 {
		return nil, fmt.Errorf("%w: shot_scores must have exactly 25 entries", ErrInvalidCard)
	}
	if len(input.ShotXs) != 25 {
		return nil, fmt.Errorf("%w: shot_xs must have exactly 25 entries", ErrInvalidCard)
	}
	if input.ShotAt == "" {
		return nil, fmt.Errorf("%w: shot_at is required", ErrInvalidCard)
	}

	var totalScore, xCount int16
	for i, score := range input.ShotScores {
		if score < 0 || score > 10 {
			return nil, fmt.Errorf("%w: shot %d score %d out of range 0-10", ErrInvalidCard, i+1, score)
		}
		totalScore += score
		if input.ShotXs[i] {
			xCount++
		}
	}

	ev, err := s.resolveEventContext(ctx, userID, input.LeagueRoundID, input.EventParticipantID)
	if err != nil {
		return nil, err
	}
	if ev != nil {
		if ev.RequireImageUpload {
			// Direct create has no image yet; require_image_upload is enforced
			// at graduate-time so the user can upload after the initial create.
			// Block here only for the full-create path.
			return nil, fmt.Errorf("%w: event requires the card image to be uploaded; use the quick-capture flow", ErrInvalidCard)
		}
		applyEventDefaults(&input.Discipline, &input.ClubID, ev)
		// Reject duplicate submissions for the same participant.
		if existing, err := s.cards.GetExistingCardForParticipant(ctx, *input.EventParticipantID); err == nil && existing != nil && !existing.IsDraft {
			return nil, fmt.Errorf("%w: this participant already has a submitted card", ErrInvalidCard)
		}
	}

	// Enforce max_submissions_per_round when submitting to a league round
	var maxSubmissions int
	if input.LeagueRoundID != nil && *input.LeagueRoundID != "" && s.leagueRepo != nil {
		// Verify the user is a member of this league
		lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *input.LeagueRoundID)
		if err != nil {
			return nil, fmt.Errorf("resolve league for round: %w", err)
		}
		isMember, err := s.leagueRepo.IsMember(ctx, lid, userID)
		if err != nil {
			return nil, fmt.Errorf("check league membership: %w", err)
		}
		if !isMember {
			return nil, ErrNotLeagueMember
		}

		cfg, err := s.leagueRepo.GetConfigByRoundID(ctx, *input.LeagueRoundID)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, fmt.Errorf("check league config: %w", err)
		}
		maxSubmissions, err = s.checkMaxSubmissionsPerRound(ctx, userID, *input.LeagueRoundID, cfg, false)
		if err != nil {
			return nil, err
		}

		// Auto-populate club_id from the league if not explicitly provided
		if input.ClubID == nil || *input.ClubID == "" {
			if league, err := s.leagueRepo.GetByID(ctx, lid); err == nil && league != nil && league.ClubID != nil {
				input.ClubID = league.ClubID
			}
		}
	}

	card, err := s.cards.Create(ctx, userID, input, totalScore, xCount, maxSubmissions)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionLimitExceeded) {
			return nil, fmt.Errorf("%w: limit is %d per round", ErrMaxSubmissions, maxSubmissions)
		}
		return nil, err
	}
	card = s.applyLeagueAutoVerify(ctx, card)

	isPB, err := s.cards.IsPersonalBest(ctx, userID, card.ID, card.TotalScore)
	if err != nil {
		isPB = false
	}

	if s.activity != nil {
		targetID := card.ID
		targetType := "score_card"
		meta := model.ScorePostedMeta{TotalScore: card.TotalScore, XCount: card.XCount, IsPB: isPB}
		if card.CardImageURL != nil {
			meta.CardImageURL = *card.CardImageURL
		}
		if rn, pn, err := s.cards.GetGearLabels(ctx, card.ID); err == nil {
			meta.RifleName = rn
			meta.PelletName = pn
		}

		// Resolve league_id from round if this is a league submission
		var leagueID *string
		if card.LeagueRoundID != nil && *card.LeagueRoundID != "" && s.leagueRepo != nil {
			if lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *card.LeagueRoundID); err == nil {
				leagueID = &lid
			}
		}

		activityType := model.ActivityScorePosted
		if isPB {
			activityType = model.ActivityPersonalBest
		}
		s.safeGo("activity.Ingest(create)", func() {
			s.activity.Ingest(context.Background(), userID, activityType, &targetID, &targetType, meta, leagueID, card.ClubID, card.Visibility)
		})
	}

	if s.achievement != nil {
		s.safeGo("achievement.EvaluateForScoreCard(create)", func() {
			s.achievement.EvaluateForScoreCard(context.Background(), userID, card)
		})
		s.safeGo("achievement.EvaluateForPersonalBest(create)", func() {
			s.achievement.EvaluateForPersonalBest(context.Background(), userID, isPB)
		})
	}

	return card, nil
}

// GetByID returns a score card owned by the given user.
func (s *ScoreCardService) GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error) {
	card, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return card, nil
}

// GetPublicByID returns a score card by ID without an ownership check.
func (s *ScoreCardService) GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error) {
	card, err := s.cards.GetPublicByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return card, nil
}

// GetForViewer returns a score card when either the viewer owns it or the
// card is public and the owner's profile is not private. Anonymous callers
// pass viewerID="". Returns repository.ErrNotFound when the viewer isn't
// allowed to see the card.
func (s *ScoreCardService) GetForViewer(ctx context.Context, id, viewerID string) (*model.ScoreCard, error) {
	card, err := s.cards.GetPublicByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if viewerID != "" && viewerID == card.UserID {
		return card, nil
	}
	// Drafts are private to the owner; they never graduate into a shared view
	// until the user clears the flag via the refine flow.
	if card.IsDraft {
		return nil, repository.ErrNotFound
	}
	if card.Visibility != "public" {
		return nil, repository.ErrNotFound
	}
	if s.users != nil {
		owner, err := s.users.GetByID(ctx, card.UserID)
		if err != nil {
			return nil, err
		}
		if owner.ProfileVisibility == "private" {
			return nil, repository.ErrNotFound
		}
	}
	return card, nil
}

// GetForViewerWithAuthor returns a score card alongside a compact author
// block and the owner's earned achievements. Privacy rules mirror
// GetForViewer: anonymous viewers see only public cards owned by public
// profiles. The author / achievements fields degrade to nil on any lookup
// error so a transient profile fetch never hides an otherwise-visible card.
func (s *ScoreCardService) GetForViewerWithAuthor(ctx context.Context, id, viewerID string) (*model.ScoreCardWithAuthor, error) {
	card, err := s.GetForViewer(ctx, id, viewerID)
	if err != nil {
		return nil, err
	}
	out := &model.ScoreCardWithAuthor{ScoreCard: card}
	if !card.IsDraft {
		if stats, err := s.cards.GetPriorScoreStats(ctx, card.UserID, card.ID); err == nil && stats != nil && stats.Count > 0 {
			avg := stats.Mean
			out.RunningAvg = &avg
			if card.TotalScore > stats.PreviousMax {
				delta := card.TotalScore - stats.PreviousMax
				out.IsPB = true
				out.PBDelta = &delta
			}
		}
	}
	if s.users != nil {
		if owner, err := s.users.GetByID(ctx, card.UserID); err == nil && owner != nil {
			out.Author = &model.ScoreCardAuthor{
				ID:          owner.ID,
				DisplayName: owner.DisplayName,
				AvatarURL:   owner.AvatarURL,
				Location:    owner.Location,
				Bio:         owner.Bio,
				StarLevel:   owner.StarLevel,
			}
		}
	}
	if s.achievement != nil {
		if items, err := s.achievement.ListForUser(ctx, card.UserID, viewerID); err == nil {
			out.Achievements = make([]*model.ScoreCardAchievement, 0, len(items))
			for _, a := range items {
				out.Achievements = append(out.Achievements, &model.ScoreCardAchievement{
					ID:       a.ID,
					Name:     a.Name,
					Icon:     a.Icon,
					EarnedAt: a.EarnedAt,
				})
			}
		}
	}
	return out, nil
}

// ListByUser returns paginated summaries for the requesting user.
// scope filters results: "personal", "league", "club", "drafts", or "" (all non-draft).
// leagueID optionally filters to cards belonging to a specific league.
func (s *ScoreCardService) ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if scope != "" && scope != "personal" && scope != "league" && scope != "club" && scope != "drafts" {
		scope = ""
	}
	return s.cards.ListByUser(ctx, userID, limit, offset, scope, leagueID)
}

// GetDraftCount returns how many quick-capture drafts the user has yet to refine.
func (s *ScoreCardService) GetDraftCount(ctx context.Context, userID string) (int, error) {
	return s.cards.GetDraftCount(ctx, userID)
}

// QuickCreate persists a quick-capture draft with minimal data. The normal
// league enforcement (max submissions, image required) is intentionally
// skipped — those rules apply when the user graduates the draft. Activity
// feed ingestion is also skipped; drafts are private-to-owner until refined.
func (s *ScoreCardService) QuickCreate(ctx context.Context, userID string, input *model.QuickCreateScoreCardInput) (*model.ScoreCard, error) {
	ev, err := s.resolveEventContext(ctx, userID, input.LeagueRoundID, input.EventParticipantID)
	if err != nil {
		return nil, err
	}
	if ev != nil {
		applyEventDefaults(&input.Discipline, &input.ClubID, ev)
		// Reject if a finalised card already exists for this participant. Drafts
		// are allowed alongside, so a participant can restart capture mid-shoot.
		if existing, err := s.cards.GetExistingCardForParticipant(ctx, *input.EventParticipantID); err == nil && existing != nil && !existing.IsDraft {
			return nil, fmt.Errorf("%w: this participant already has a submitted card", ErrInvalidCard)
		}
	}
	// Auto-populate club_id from the league if a league round was chosen so
	// refinement lands in the same club context later.
	if input.LeagueRoundID != nil && *input.LeagueRoundID != "" && s.leagueRepo != nil {
		if input.ClubID == nil || *input.ClubID == "" {
			if lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *input.LeagueRoundID); err == nil {
				if league, err := s.leagueRepo.GetByID(ctx, lid); err == nil && league.ClubID != nil {
					input.ClubID = league.ClubID
				}
			}
		}
	}
	return s.cards.CreateDraft(ctx, userID, input)
}

// Graduate flips a draft's is_draft flag to false, re-evaluates verification
// based on league round linkage, and emits the activity + achievement events
// that were suppressed at draft creation. The caller must first PATCH the
// full shot grid via Update; Graduate assumes the card is already complete.
func (s *ScoreCardService) Graduate(ctx context.Context, id, userID string) (*model.ScoreCard, error) {
	card, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if !card.IsDraft {
		return card, nil
	}
	if len(card.ShotScores) != 25 || len(card.ShotXs) != 25 {
		return nil, fmt.Errorf("%w: refine the card with 25 shots before graduating", ErrInvalidCard)
	}

	// Enforce league rules at graduation (not at quick-capture).
	var maxSubmissions int
	if card.LeagueRoundID != nil && *card.LeagueRoundID != "" && s.leagueRepo != nil {
		cfg, cfgErr := s.leagueRepo.GetConfigByRoundID(ctx, *card.LeagueRoundID)
		if cfgErr != nil && !errors.Is(cfgErr, repository.ErrNotFound) {
			return nil, fmt.Errorf("check league config: %w", cfgErr)
		}
		// Exclude this card itself; only peer submissions count toward the cap.
		maxSubmissions, err = s.checkMaxSubmissionsPerRound(ctx, userID, *card.LeagueRoundID, cfg, true)
		if err != nil {
			return nil, err
		}
	}

	// Enforce event rules at graduation when the card is event-bound.
	var eventForCard *model.Event
	if card.EventParticipantID != nil && *card.EventParticipantID != "" && s.events != nil {
		ev, _, err := s.events.LookupParticipantWithEvent(ctx, *card.EventParticipantID)
		if err != nil {
			return nil, err
		}
		if ev.State != model.EventStateLive {
			return nil, fmt.Errorf("%w: event is not live", ErrInvalidCard)
		}
		if ev.RequireImageUpload && (card.CardImageURL == nil || *card.CardImageURL == "") {
			return nil, fmt.Errorf("%w: event requires a card image upload before graduation", ErrInvalidCard)
		}
		eventForCard = ev
	}

	updated, err := s.cards.Graduate(ctx, id, userID, card.LeagueRoundID, maxSubmissions)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionLimitExceeded) {
			return nil, fmt.Errorf("%w: limit is %d per round", ErrMaxSubmissions, maxSubmissions)
		}
		return nil, err
	}

	// For event-bound cards, override the default 'pending' verification to
	// 'verified' when the event does not require peer verification.
	if eventForCard != nil && !eventForCard.RequireScoreVerification {
		if err := s.cards.SetVerification(ctx, updated.ID, "verified"); err == nil {
			updated.Verification = "verified"
		}
	}
	// Same for league-bound cards whose league runs without verification.
	updated = s.applyLeagueAutoVerify(ctx, updated)

	isPB, pbErr := s.cards.IsPersonalBest(ctx, userID, updated.ID, updated.TotalScore)
	if pbErr != nil {
		isPB = false
	}

	if s.activity != nil {
		targetID := updated.ID
		targetType := "score_card"
		meta := model.ScorePostedMeta{TotalScore: updated.TotalScore, XCount: updated.XCount, IsPB: isPB}
		if updated.CardImageURL != nil {
			meta.CardImageURL = *updated.CardImageURL
		}
		if rn, pn, err := s.cards.GetGearLabels(ctx, updated.ID); err == nil {
			meta.RifleName = rn
			meta.PelletName = pn
		}
		var leagueID *string
		if updated.LeagueRoundID != nil && *updated.LeagueRoundID != "" && s.leagueRepo != nil {
			if lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *updated.LeagueRoundID); err == nil {
				leagueID = &lid
			}
		}
		if eventForCard != nil {
			meta.EventName = eventForCard.Name
			meta.EventSlug = eventForCard.Slug
		}
		activityType := model.ActivityScorePosted
		if isPB {
			activityType = model.ActivityPersonalBest
		}
		s.safeGo("activity.Ingest(update)", func() {
			s.activity.Ingest(context.Background(), userID, activityType, &targetID, &targetType, meta, leagueID, updated.ClubID, updated.Visibility)
		})
	}

	if s.achievement != nil {
		s.safeGo("achievement.EvaluateForScoreCard(update)", func() {
			s.achievement.EvaluateForScoreCard(context.Background(), userID, updated)
		})
		s.safeGo("achievement.EvaluateForPersonalBest(update)", func() {
			s.achievement.EvaluateForPersonalBest(context.Background(), userID, isPB)
		})
	}

	return updated, nil
}

// Update modifies a score card's shots and metadata, resets verification, and
// clears any existing peer confirmations.
func (s *ScoreCardService) Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput) (*model.ScoreCard, error) {
	if len(input.ShotScores) != 25 {
		return nil, fmt.Errorf("%w: shot_scores must have exactly 25 entries", ErrInvalidCard)
	}
	if len(input.ShotXs) != 25 {
		return nil, fmt.Errorf("%w: shot_xs must have exactly 25 entries", ErrInvalidCard)
	}
	if input.ShotAt == "" {
		return nil, fmt.Errorf("%w: shot_at is required", ErrInvalidCard)
	}

	var totalScore, xCount int16
	for i, score := range input.ShotScores {
		if score < 0 || score > 10 {
			return nil, fmt.Errorf("%w: shot %d score %d out of range 0-10", ErrInvalidCard, i+1, score)
		}
		totalScore += score
		if input.ShotXs[i] {
			xCount++
		}
	}

	card, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureNotLockedCard(ctx, card); err != nil {
		return nil, err
	}
	if err := s.resolveLeagueDetach(card, input); err != nil {
		return nil, err
	}
	if err := s.resolveClubChange(ctx, userID, card, input); err != nil {
		return nil, err
	}
	// Editing a rejected league card is the shooter's recourse, but it must
	// leave a trace: the silent rejected → pending flip the update performs is
	// recorded as an owner reopen in the audit trail. A card on its way out of
	// the league is not reopened — it stops being a league card entirely.
	wasRejectedLeagueCard := card.Verification == "rejected" &&
		card.LeagueRoundID != nil && *card.LeagueRoundID != "" && s.leagueRepo != nil &&
		input.LeagueRoundID == nil

	updated, err := s.cards.Update(ctx, id, userID, input, totalScore, xCount)
	if err != nil {
		return nil, err
	}
	if wasRejectedLeagueCard {
		if reopenErr := s.leagueRepo.RecordOwnerReopen(ctx, id, userID); reopenErr != nil {
			s.log.Warn().Err(reopenErr).Str("score_card_id", id).Msg("score_card: record owner reopen failed")
		}
	}
	return s.applyLeagueAutoVerify(ctx, updated), nil
}

// Rotate updates only the card_image_rotation field. Rotation is a cosmetic
// display setting, so this path deliberately skips ensureNotLocked and does
// not reset verification or clear peer confirmations.
func (s *ScoreCardService) Rotate(ctx context.Context, id, userID string, rotation int16) (*model.ScoreCard, error) {
	switch rotation {
	case 0, 90, 180, 270:
	default:
		return nil, fmt.Errorf("%w: rotation must be 0, 90, 180, or 270", ErrInvalidCard)
	}
	return s.cards.UpdateImageRotation(ctx, id, userID, rotation)
}

// Delete removes a score card, enforcing the league's lock-edits-after-verification
// policy when the card is a verified or rejected league submission.
func (s *ScoreCardService) Delete(ctx context.Context, id, userID string) error {
	card, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return err
	}
	if err := s.ensureNotLockedCard(ctx, card); err != nil {
		return err
	}
	return s.cards.Delete(ctx, id, userID)
}

// resolveLeagueDetach validates input.LeagueRoundID against the card's current
// round and normalises it for the repository. An empty string detaches the card
// so it is kept as a personal one — the escape hatch for a shooter whose round
// is full or closed, who would otherwise be stuck with an unsubmittable card.
// A non-empty value is only accepted when it names the round the card already
// sits in (the refine form echoes it back); attaching a card to a league is
// SubmitToLeague's job, which runs the membership and cap checks. Anything else
// is rejected rather than silently ignored. Omitting the field, or repeating
// the current round, clears it so the repository leaves the link alone.
func (s *ScoreCardService) resolveLeagueDetach(card *model.ScoreCard, input *model.UpdateScoreCardInput) error {
	if input.LeagueRoundID == nil {
		return nil
	}
	current := ""
	if card.LeagueRoundID != nil {
		current = *card.LeagueRoundID
	}
	if *input.LeagueRoundID == current {
		input.LeagueRoundID = nil
		return nil
	}
	if *input.LeagueRoundID != "" {
		return fmt.Errorf("%w: use submit-to-league to move a card to a different round", ErrInvalidCard)
	}
	return nil
}

// resolveClubChange validates input.ClubID against the card's current club and
// normalises it for the repository. An empty string takes the card out of its
// club; a club the user belongs to re-homes it; repeating the current club (or
// omitting the field) leaves the link alone. A club the user is not a member of
// is refused rather than silently accepted.
func (s *ScoreCardService) resolveClubChange(ctx context.Context, userID string, card *model.ScoreCard, input *model.UpdateScoreCardInput) error {
	if input.ClubID == nil {
		return nil
	}
	current := ""
	if card.ClubID != nil {
		current = *card.ClubID
	}
	if *input.ClubID == current {
		input.ClubID = nil
		return nil
	}
	if *input.ClubID == "" || s.clubs == nil {
		return nil
	}
	isMember, err := s.clubs.IsMember(ctx, *input.ClubID, userID)
	if err != nil {
		return fmt.Errorf("check club membership: %w", err)
	}
	if !isMember {
		return ErrNotClubMember
	}
	return nil
}

// checkMaxSubmissionsPerRound enforces cfg.MaxSubmissionsPerRound (when set)
// against the user's current submission count, returning the resolved limit
// (0 if unconfigured) for the repository to also enforce atomically.
// excludeSelf accounts for a card that already counts itself in the tally
// (graduation), unlike a brand-new create or submit.
func (s *ScoreCardService) checkMaxSubmissionsPerRound(ctx context.Context, userID, roundID string, cfg *model.LeagueConfig, excludeSelf bool) (int, error) {
	if cfg == nil || cfg.MaxSubmissionsPerRound <= 0 {
		return 0, nil
	}
	// Fast-fail on the common (non-racing) case; the repository enforces the
	// cap atomically as well, so a concurrent request racing this check still
	// can't slip past the limit.
	count, err := s.leagueRepo.CountUserSubmissionsForRound(ctx, userID, roundID)
	if err != nil {
		return 0, fmt.Errorf("count submissions: %w", err)
	}
	if excludeSelf {
		count--
	}
	if count >= int(cfg.MaxSubmissionsPerRound) {
		return 0, fmt.Errorf("%w: limit is %d per round", ErrMaxSubmissions, cfg.MaxSubmissionsPerRound)
	}
	return int(cfg.MaxSubmissionsPerRound), nil
}

// ensureNotLockedCard returns ErrEditsLocked when the card is verified or
// rejected and its league or event has lock_edits_after_verification enabled.
// Rejected cards are covered so a shooter cannot quietly delete (or rewrite)
// a card an admin has ruled on while the league locks decided cards. It
// silently allows the action for personal cards, pending cards, or when the
// league / event config is unavailable.
func (s *ScoreCardService) ensureNotLockedCard(ctx context.Context, card *model.ScoreCard) error {
	if card.Verification != "verified" && card.Verification != "rejected" {
		return nil
	}
	if card.EventParticipantID != nil && *card.EventParticipantID != "" && s.events != nil {
		ev, _, err := s.events.LookupParticipantWithEvent(ctx, *card.EventParticipantID)
		if err == nil && ev != nil && ev.LockEditsAfterVerification {
			return ErrEditsLocked
		}
		return nil
	}
	if card.LeagueRoundID == nil || *card.LeagueRoundID == "" {
		return nil
	}
	if s.leagueRepo == nil {
		return nil
	}
	cfg, err := s.leagueRepo.GetConfigByRoundID(ctx, *card.LeagueRoundID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("check lock policy: %w", err)
	}
	if cfg != nil && cfg.LockEditsAfterVerification {
		return ErrEditsLocked
	}
	return nil
}

// applyLeagueAutoVerify flips a pending league card straight to 'verified'
// when its league does not require score verification — the exact counterpart
// of the event override above. Without it, nothing could ever verify the card
// and it would sit outside the standings forever. Best-effort: on any lookup
// failure the card is returned unchanged.
func (s *ScoreCardService) applyLeagueAutoVerify(ctx context.Context, card *model.ScoreCard) *model.ScoreCard {
	if card == nil || card.IsDraft || card.Verification != "pending" {
		return card
	}
	if card.LeagueRoundID == nil || *card.LeagueRoundID == "" || s.leagueRepo == nil {
		return card
	}
	cfg, err := s.leagueRepo.GetConfigByRoundID(ctx, *card.LeagueRoundID)
	if err != nil || cfg == nil || cfg.RequireScoreVerification {
		return card
	}
	if err := s.cards.SetVerification(ctx, card.ID, "verified"); err == nil {
		card.Verification = "verified"
	}
	return card
}

// UpdateImageURL updates the card_image_url for a score card owned by the given user.
func (s *ScoreCardService) UpdateImageURL(ctx context.Context, id, userID, imageURL string) error {
	// Verify ownership first
	_, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return err
	}
	return s.cards.UpdateImageURL(ctx, id, userID, imageURL)
}

// SubmitToLeague links an already-graduated score card to a league round.
// Validates the same rules as Create when a league_round_id is provided:
// membership, round open/closed, max submissions, and image required.
// The card must not already be linked to a round.
func (s *ScoreCardService) SubmitToLeague(ctx context.Context, cardID, userID, roundID string) (*model.ScoreCard, error) {
	card, err := s.cards.GetByID(ctx, cardID, userID)
	if err != nil {
		return nil, err
	}
	// An event card belongs to its event; a league round is not somewhere it
	// can be moved to.
	if card.EventParticipantID != nil && *card.EventParticipantID != "" {
		return nil, fmt.Errorf("%w: an event card cannot be submitted to a league", ErrInvalidCard)
	}
	current := ""
	if card.LeagueRoundID != nil {
		current = *card.LeagueRoundID
	}
	if current == roundID {
		return card, nil
	}
	// Moving a card out of a round it has already been ruled on is an edit
	// like any other, so the league's lock policy applies.
	if current != "" {
		if err := s.ensureNotLockedCard(ctx, card); err != nil {
			return nil, err
		}
	}

	if s.leagueRepo != nil {
		lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, roundID)
		if err != nil {
			return nil, fmt.Errorf("resolve league for round: %w", err)
		}
		isMember, err := s.leagueRepo.IsMember(ctx, lid, userID)
		if err != nil {
			return nil, fmt.Errorf("check league membership: %w", err)
		}
		if !isMember {
			return nil, ErrNotLeagueMember
		}

		cfg, cfgErr := s.leagueRepo.GetConfigByRoundID(ctx, roundID)
		if cfgErr != nil && !errors.Is(cfgErr, repository.ErrNotFound) {
			return nil, fmt.Errorf("check league config: %w", cfgErr)
		}
		// A draft is checked at graduation, not here: the cap counts only
		// graduated cards, and refusing to park a draft in a full round is
		// exactly the dead end the refine flow exists to avoid.
		if cfg != nil && !card.IsDraft {
			if _, err := s.checkMaxSubmissionsPerRound(ctx, userID, roundID, cfg, false); err != nil {
				return nil, err
			}
			if cfg.RequireImageUpload && (card.CardImageURL == nil || *card.CardImageURL == "") {
				return nil, fmt.Errorf("%w: this league requires an image upload", ErrInvalidCard)
			}
		}
	}

	submitted, err := s.cards.SubmitToLeague(ctx, cardID, userID, roundID)
	if err != nil {
		return nil, err
	}
	return s.applyLeagueAutoVerify(ctx, submitted), nil
}
