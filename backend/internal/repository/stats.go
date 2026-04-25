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
			ROUND(AVG(total_score)::numeric, 2),
			(SELECT ROUND(AVG(total_score)::numeric, 2)
			 FROM (SELECT total_score FROM score_cards WHERE user_id = $1 AND is_draft = FALSE ORDER BY shot_at DESC, created_at DESC LIMIT 10) sub),
			(SELECT id::text FROM score_cards
			 WHERE user_id = $1 AND is_draft = FALSE
			 ORDER BY total_score DESC, x_count DESC, shot_at DESC
			 LIMIT 1)
		FROM score_cards
		WHERE user_id = $1 AND is_draft = FALSE
	`, userID).Scan(
		&stats.CardsLogged,
		&stats.BestScore,
		&stats.BestXCount,
		&stats.AvgScore,
		&stats.Rolling10Avg,
		&stats.BestScoreCardID,
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
		WHERE user_id = $1 AND rifle_id IS NOT NULL AND is_draft = FALSE
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

func (r *StatsRepository) GetScoreTrends(ctx context.Context, userID, granularity string, rifleID *string) ([]*model.ScoreTrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			DATE_TRUNC($2, shot_at)::date::text            AS period,
			ROUND(AVG(total_score)::numeric, 2)             AS avg_score,
			MAX(total_score)::smallint                      AS best_score,
			ROUND(COALESCE(STDDEV_POP(total_score), 0)::numeric, 2) AS std_dev,
			COUNT(*)::int                                   AS card_count,
			ROUND(AVG(x_count)::numeric, 2)                 AS avg_x_count,
			MAX(x_count)::smallint                          AS best_x_count
		FROM score_cards
		WHERE user_id = $1
		  AND ($3::UUID IS NULL OR rifle_id = $3)
		  AND is_draft = FALSE
		GROUP BY DATE_TRUNC($2, shot_at)
		ORDER BY period
	`, userID, granularity, rifleID)
	if err != nil {
		return nil, fmt.Errorf("get score trends: %w", err)
	}
	defer rows.Close()

	var points []*model.ScoreTrendPoint
	for rows.Next() {
		var p model.ScoreTrendPoint
		if err := rows.Scan(&p.Period, &p.AvgScore, &p.BestScore, &p.StdDev, &p.CardCount, &p.AvgXCount, &p.BestXCount); err != nil {
			return nil, fmt.Errorf("scan trend point: %w", err)
		}
		points = append(points, &p)
	}
	return points, rows.Err()
}
