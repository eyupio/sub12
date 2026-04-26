package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)


var (
	ErrInvalidCard      = errors.New("invalid score card")
	ErrMaxSubmissions   = errors.New("maximum submissions per round reached")
	ErrEditsLocked      = errors.New("score card is locked by league policy")
	ErrNotLeagueMember  = errors.New("league membership required")
)

// ScoreCardRepo is implemented by repository.ScoreCardRepository.
type ScoreCardRepo interface {
	Create(ctx context.Context, userID string, input *model.CreateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error)
	CreateDraft(ctx context.Context, userID string, input *model.QuickCreateScoreCardInput) (*model.ScoreCard, error)
	Graduate(ctx context.Context, id, userID string) (*model.ScoreCard, error)
	GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error)
	GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error)
	ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error)
	GetDraftCount(ctx context.Context, userID string) (int, error)
	UpdateImageURL(ctx context.Context, id, imageURL string) error
	Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error)
	Delete(ctx context.Context, id, userID string) error
	IsPersonalBest(ctx context.Context, userID, cardID string, totalScore int16) (bool, error)
	GetPriorScoreStats(ctx context.Context, userID, excludeID string) (*repository.PriorScoreStats, error)
	GetGearLabels(ctx context.Context, cardID string) (string, string, error)
}

// LeagueConfigRepo provides league config lookups needed by ScoreCardService.
type LeagueConfigRepo interface {
	GetConfigByRoundID(ctx context.Context, roundID string) (*model.LeagueConfig, error)
	CountUserSubmissionsForRound(ctx context.Context, userID, roundID string) (int, error)
	GetLeagueIDByRoundID(ctx context.Context, roundID string) (string, error)
	GetByID(ctx context.Context, id string) (*model.League, error)
	IsMember(ctx context.Context, leagueID, userID string) (bool, error)
}

// UserProfileReader returns the profile-visibility flag needed when deciding
// whether to expose a public item to anonymous viewers.
type UserProfileReader interface {
	GetByID(ctx context.Context, id string) (*model.User, error)
}

type ScoreCardService struct {
	cards       ScoreCardRepo
	leagueRepo  LeagueConfigRepo    // optional; nil skips league rule enforcement
	users       UserProfileReader   // optional; nil skips owner-privacy checks
	activity    *ActivityService    // optional; nil disables feed ingestion
	achievement *AchievementService // optional; nil disables achievement evaluation
}

func NewScoreCardService(cards ScoreCardRepo, leagueRepo LeagueConfigRepo, activity *ActivityService, achievement *AchievementService) *ScoreCardService {
	return &ScoreCardService{cards: cards, leagueRepo: leagueRepo, activity: activity, achievement: achievement}
}

// SetUserReader wires a user lookup so GetForViewer can enforce the owner's
// profile_visibility when deciding whether to expose a public card.
func (s *ScoreCardService) SetUserReader(users UserProfileReader) {
	s.users = users
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

	// Enforce max_submissions_per_round when submitting to a league round
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
		if cfg != nil && cfg.MaxSubmissionsPerRound > 0 {
			count, err := s.leagueRepo.CountUserSubmissionsForRound(ctx, userID, *input.LeagueRoundID)
			if err != nil {
				return nil, fmt.Errorf("count submissions: %w", err)
			}
			if count >= int(cfg.MaxSubmissionsPerRound) {
				return nil, fmt.Errorf("%w: limit is %d per round", ErrMaxSubmissions, cfg.MaxSubmissionsPerRound)
			}
		}

		// Auto-populate club_id from the league if not explicitly provided
		if (input.ClubID == nil || *input.ClubID == "") {
			if league, err := s.leagueRepo.GetByID(ctx, lid); err == nil && league != nil && league.ClubID != nil {
				input.ClubID = league.ClubID
			}
		}
	}

	card, err := s.cards.Create(ctx, userID, input, totalScore, xCount)
	if err != nil {
		return nil, err
	}

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
		go s.activity.Ingest(context.Background(), userID, activityType, &targetID, &targetType, meta, leagueID, card.ClubID, card.Visibility)
	}

	if s.achievement != nil {
		go s.achievement.EvaluateForScoreCard(context.Background(), userID, card)
		go s.achievement.EvaluateForPersonalBest(context.Background(), userID, isPB)
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
	// Auto-populate club_id from the league if a league round was chosen so
	// refinement lands in the same club context later.
	if input.LeagueRoundID != nil && *input.LeagueRoundID != "" && s.leagueRepo != nil {
		if (input.ClubID == nil || *input.ClubID == "") {
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
	if card.LeagueRoundID != nil && *card.LeagueRoundID != "" && s.leagueRepo != nil {
		cfg, cfgErr := s.leagueRepo.GetConfigByRoundID(ctx, *card.LeagueRoundID)
		if cfgErr != nil && !errors.Is(cfgErr, repository.ErrNotFound) {
			return nil, fmt.Errorf("check league config: %w", cfgErr)
		}
		if cfg != nil && cfg.MaxSubmissionsPerRound > 0 {
			count, err := s.leagueRepo.CountUserSubmissionsForRound(ctx, userID, *card.LeagueRoundID)
			if err != nil {
				return nil, fmt.Errorf("count submissions: %w", err)
			}
			// Exclude this card itself; only peer submissions count toward the cap.
			if count-1 >= int(cfg.MaxSubmissionsPerRound) {
				return nil, fmt.Errorf("%w: limit is %d per round", ErrMaxSubmissions, cfg.MaxSubmissionsPerRound)
			}
		}
	}

	updated, err := s.cards.Graduate(ctx, id, userID)
	if err != nil {
		return nil, err
	}

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
		activityType := model.ActivityScorePosted
		if isPB {
			activityType = model.ActivityPersonalBest
		}
		go s.activity.Ingest(context.Background(), userID, activityType, &targetID, &targetType, meta, leagueID, updated.ClubID, updated.Visibility)
	}

	if s.achievement != nil {
		go s.achievement.EvaluateForScoreCard(context.Background(), userID, updated)
		go s.achievement.EvaluateForPersonalBest(context.Background(), userID, isPB)
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

	if err := s.ensureNotLocked(ctx, id, userID); err != nil {
		return nil, err
	}

	return s.cards.Update(ctx, id, userID, input, totalScore, xCount)
}

// Delete removes a score card, enforcing the league's lock-edits-after-verification
// policy when the card is a verified league submission.
func (s *ScoreCardService) Delete(ctx context.Context, id, userID string) error {
	if err := s.ensureNotLocked(ctx, id, userID); err != nil {
		return err
	}
	return s.cards.Delete(ctx, id, userID)
}

// ensureNotLocked returns ErrEditsLocked when the card is verified and its
// league has lock_edits_after_verification enabled. It silently allows the
// action for personal cards, unverified league cards, or when the league
// config is unavailable.
func (s *ScoreCardService) ensureNotLocked(ctx context.Context, id, userID string) error {
	card, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return err
	}
	if card.LeagueRoundID == nil || *card.LeagueRoundID == "" {
		return nil
	}
	if card.Verification != "verified" {
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

// UpdateImageURL updates the card_image_url for a score card owned by the given user.
func (s *ScoreCardService) UpdateImageURL(ctx context.Context, id, userID, imageURL string) error {
	// Verify ownership first
	_, err := s.cards.GetByID(ctx, id, userID)
	if err != nil {
		return err
	}
	return s.cards.UpdateImageURL(ctx, id, imageURL)
}
