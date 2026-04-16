package service

import (
	"context"
	"fmt"
	"time"

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
	activity     *ActivityService // nil disables feed ingestion
}

func NewAchievementService(achievements *repository.AchievementRepository, cards CardCountRepo, activity *ActivityService) *AchievementService {
	return &AchievementService{achievements: achievements, cards: cards, activity: activity}
}

// EvaluateForScoreCard checks all achievement rules against the newly created card
// and awards any that pass. Intended to be called in a goroutine after card creation.
// An internal timeout bounds the operation so hung goroutines don't leak.
func (s *AchievementService) EvaluateForScoreCard(ctx context.Context, userID string, card *model.ScoreCard) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

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

	// Achievement name/icon mapping for feed metadata
	achievementNames := map[string]string{
		"first_card":    "First Card",
		"century":       "Century",
		"perfect_score": "Perfect Score",
		"sharp_eye":     "Sharp Eye",
		"sharpshooter":  "Sharpshooter",
		"dedicated":     "Dedicated",
		"league_debut":  "League Debut",
	}

	for _, id := range candidates {
		awarded, err := s.achievements.Award(ctx, userID, id)
		if err != nil {
			continue
		}
		if awarded && s.activity != nil {
			aid, tt := id, "achievement"
			meta := model.AchievementEarnedMeta{
				AchievementID:   id,
				AchievementName: achievementNames[id],
			}
			go s.activity.Ingest(context.Background(), userID, model.ActivityAchievementEarned, &aid, &tt, meta, nil, nil, "public")
		}
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
