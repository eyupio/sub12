package service

import (
	"context"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type AchievementRepo interface {
	Award(ctx context.Context, userID, achievementID string) (bool, error)
	ListForUser(ctx context.Context, userID string) ([]*model.UserAchievement, error)
}

type CardCountRepo interface {
	GetCardCount(ctx context.Context, userID string) (int, error)
}

type AchievementService struct {
	achievements AchievementRepo
	cards        CardCountRepo
}

func NewAchievementService(achievements *repository.AchievementRepository, cards CardCountRepo) *AchievementService {
	return &AchievementService{achievements: achievements, cards: cards}
}

// EvaluateForScoreCard checks all achievement rules against the newly created card
// and awards any that pass. Intended to be called in a goroutine after card creation.
func (s *AchievementService) EvaluateForScoreCard(ctx context.Context, userID string, card *model.ScoreCard) {
	cardCount, err := s.cards.GetCardCount(ctx, userID)
	if err != nil {
		return
	}

	candidates := []string{}

	if cardCount == 1 {
		candidates = append(candidates, "first_card")
	}
	if card.TotalScore >= 100 {
		candidates = append(candidates, "century")
	}
	if card.TotalScore == 250 {
		candidates = append(candidates, "perfect_score")
	}
	if card.XCount >= 5 {
		candidates = append(candidates, "sharp_eye")
	}
	if card.XCount >= 10 {
		candidates = append(candidates, "sharpshooter")
	}
	if cardCount >= 10 {
		candidates = append(candidates, "dedicated")
	}
	if card.LeagueRoundID != nil {
		candidates = append(candidates, "league_debut")
	}

	for _, id := range candidates {
		s.achievements.Award(ctx, userID, id) //nolint:errcheck
	}
}

// ListForUser returns all achievements earned by a user.
func (s *AchievementService) ListForUser(ctx context.Context, userID string) ([]*model.UserAchievement, error) {
	items, err := s.achievements.ListForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list achievements: %w", err)
	}
	return items, nil
}
