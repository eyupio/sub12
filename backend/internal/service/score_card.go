package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)


var (
	ErrInvalidCard       = errors.New("invalid score card")
	ErrMaxSubmissions    = errors.New("maximum submissions per round reached")
)

// ScoreCardRepo is implemented by repository.ScoreCardRepository.
type ScoreCardRepo interface {
	Create(ctx context.Context, userID string, input *model.CreateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error)
	GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error)
	GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error)
	ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error)
	UpdateImageURL(ctx context.Context, id, imageURL string) error
	Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error)
}

// LeagueConfigRepo provides league config lookups needed by ScoreCardService.
type LeagueConfigRepo interface {
	GetConfigByRoundID(ctx context.Context, roundID string) (*model.LeagueConfig, error)
	CountUserSubmissionsForRound(ctx context.Context, userID, roundID string) (int, error)
	GetLeagueIDByRoundID(ctx context.Context, roundID string) (string, error)
	GetByID(ctx context.Context, id string) (*model.League, error)
}

type ScoreCardService struct {
	cards       ScoreCardRepo
	leagueRepo  LeagueConfigRepo    // optional; nil skips league rule enforcement
	activity    *ActivityService    // optional; nil disables feed ingestion
	achievement *AchievementService // optional; nil disables achievement evaluation
}

func NewScoreCardService(cards ScoreCardRepo, leagueRepo LeagueConfigRepo, activity *ActivityService, achievement *AchievementService) *ScoreCardService {
	return &ScoreCardService{cards: cards, leagueRepo: leagueRepo, activity: activity, achievement: achievement}
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
			if lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *input.LeagueRoundID); err == nil {
				if league, err := s.leagueRepo.GetByID(ctx, lid); err == nil && league.ClubID != nil {
					input.ClubID = league.ClubID
				}
			}
		}
	}

	card, err := s.cards.Create(ctx, userID, input, totalScore, xCount)
	if err != nil {
		return nil, err
	}

	if s.activity != nil {
		targetID := card.ID
		targetType := "score_card"
		meta := model.ScorePostedMeta{TotalScore: card.TotalScore, XCount: card.XCount}

		// Resolve league_id from round if this is a league submission
		var leagueID *string
		if card.LeagueRoundID != nil && *card.LeagueRoundID != "" && s.leagueRepo != nil {
			if lid, err := s.leagueRepo.GetLeagueIDByRoundID(ctx, *card.LeagueRoundID); err == nil {
				leagueID = &lid
			}
		}

		go s.activity.Ingest(context.Background(), userID, model.ActivityScorePosted, &targetID, &targetType, meta, leagueID, card.ClubID, card.Visibility)
	}

	if s.achievement != nil {
		go s.achievement.EvaluateForScoreCard(context.Background(), userID, card)
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

// ListByUser returns paginated summaries for the requesting user.
// scope filters results: "personal", "league", or "" (all).
// leagueID optionally filters to cards belonging to a specific league.
func (s *ScoreCardService) ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if scope != "" && scope != "personal" && scope != "league" && scope != "club" {
		scope = ""
	}
	return s.cards.ListByUser(ctx, userID, limit, offset, scope, leagueID)
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

	return s.cards.Update(ctx, id, userID, input, totalScore, xCount)
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
