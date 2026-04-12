package service

import (
	"context"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type StatsService struct {
	stats *repository.StatsRepository
}

func NewStatsService(stats *repository.StatsRepository) *StatsService {
	return &StatsService{stats: stats}
}

func (s *StatsService) GetUserStats(ctx context.Context, userID string) (*model.UserStats, error) {
	return s.stats.GetUserStats(ctx, userID)
}

func (s *StatsService) GetRifleStats(ctx context.Context, userID string) ([]*model.RifleStats, error) {
	return s.stats.GetRifleStats(ctx, userID)
}

func (s *StatsService) GetScoreTrends(ctx context.Context, userID, granularity string, rifleID *string) ([]*model.ScoreTrendPoint, error) {
	if granularity != "week" && granularity != "month" {
		granularity = "week"
	}
	return s.stats.GetScoreTrends(ctx, userID, granularity, rifleID)
}
