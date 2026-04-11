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
