package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type StatsRepository struct {
	db *pgxpool.Pool
}

func NewStatsRepository(db *pgxpool.Pool) *StatsRepository {
	return &StatsRepository{db: db}
}

func (r *StatsRepository) GetUserStats(ctx context.Context, userID string) (*model.UserStats, error) {
	var stats model.UserStats
	err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			MAX(total_score),
			MAX(x_count),
			ROUND(AVG(total_score)::numeric, 2)
		FROM score_cards
		WHERE user_id = $1
	`, userID).Scan(
		&stats.CardsLogged,
		&stats.BestScore,
		&stats.BestXCount,
		&stats.AvgScore,
	)
	if err != nil {
		return nil, fmt.Errorf("get user stats: %w", err)
	}
	return &stats, nil
}

func (r *StatsRepository) GetRifleStats(ctx context.Context, userID string) ([]*model.RifleStats, error) {
	rows, err := r.db.Query(ctx, `
		SELECT rifle_id, MAX(total_score) AS best_score,
		       MAX(x_count) AS best_x_count, COUNT(*)::int AS card_count
		FROM score_cards
		WHERE user_id = $1 AND rifle_id IS NOT NULL
		GROUP BY rifle_id
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get rifle stats: %w", err)
	}
	defer rows.Close()

	var stats []*model.RifleStats
	for rows.Next() {
		var s model.RifleStats
		if err := rows.Scan(&s.RifleID, &s.BestScore, &s.BestXCount, &s.CardCount); err != nil {
			return nil, fmt.Errorf("scan rifle stats: %w", err)
		}
		stats = append(stats, &s)
	}
	return stats, rows.Err()
}
