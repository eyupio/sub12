package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type AchievementRepository struct {
	db *pgxpool.Pool
}

func NewAchievementRepository(db *pgxpool.Pool) *AchievementRepository {
	return &AchievementRepository{db: db}
}

// Award inserts a user achievement. Returns true if newly awarded, false if already exists.
func (r *AchievementRepository) Award(ctx context.Context, userID, achievementID string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		INSERT INTO user_achievements (user_id, achievement_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, achievementID)
	if err != nil {
		return false, fmt.Errorf("award achievement: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// ListForUser returns all achievements earned by a user, newest first.
func (r *AchievementRepository) ListForUser(ctx context.Context, userID string) ([]*model.UserAchievement, error) {
	rows, err := r.db.Query(ctx, `
		SELECT d.id, d.name, d.description, d.icon, ua.earned_at
		FROM user_achievements ua
		JOIN achievement_defs d ON d.id = ua.achievement_id
		WHERE ua.user_id = $1
		ORDER BY ua.earned_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list achievements: %w", err)
	}
	defer rows.Close()

	var items []*model.UserAchievement
	for rows.Next() {
		var a model.UserAchievement
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.Icon, &a.EarnedAt); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		items = append(items, &a)
	}
	return items, rows.Err()
}
