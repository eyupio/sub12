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

// GetDef returns a single achievement definition by id.
func (r *AchievementRepository) GetDef(ctx context.Context, id string) (*model.AchievementDef, error) {
	var d model.AchievementDef
	err := r.db.QueryRow(ctx, `
		SELECT id, name, description, icon
		FROM achievement_defs
		WHERE id = $1
	`, id).Scan(&d.ID, &d.Name, &d.Description, &d.Icon)
	if err != nil {
		return nil, fmt.Errorf("get achievement def: %w", err)
	}
	return &d, nil
}

// ListDefs returns every defined achievement, ordered by id for a stable catalog.
func (r *AchievementRepository) ListDefs(ctx context.Context) ([]*model.AchievementDef, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, description, icon
		FROM achievement_defs
		ORDER BY id
	`)
	if err != nil {
		return nil, fmt.Errorf("list achievement defs: %w", err)
	}
	defer rows.Close()

	var items []*model.AchievementDef
	for rows.Next() {
		var d model.AchievementDef
		if err := rows.Scan(&d.ID, &d.Name, &d.Description, &d.Icon); err != nil {
			return nil, fmt.Errorf("scan achievement def: %w", err)
		}
		items = append(items, &d)
	}
	return items, rows.Err()
}

// CountEarners returns a map keyed by achievement id holding the number of
// distinct users who have earned each of the given achievements. Achievement
// ids with zero earners are simply absent from the returned map.
func (r *AchievementRepository) CountEarners(ctx context.Context, ids []string) (map[string]int, error) {
	out := make(map[string]int, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT achievement_id, COUNT(DISTINCT user_id)
		FROM user_achievements
		WHERE achievement_id = ANY($1)
		GROUP BY achievement_id
	`, ids)
	if err != nil {
		return nil, fmt.Errorf("count earners: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("scan earner count: %w", err)
		}
		out[id] = n
	}
	return out, rows.Err()
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
