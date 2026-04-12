package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ActivityRepository struct {
	db *pgxpool.Pool
}

func NewActivityRepository(db *pgxpool.Pool) *ActivityRepository {
	return &ActivityRepository{db: db}
}

// Ingest writes a single activity event. Fire-and-forget — callers should handle or
// log errors rather than surfacing them to users.
func (r *ActivityRepository) Ingest(ctx context.Context, userID string, actType model.ActivityType, targetID, targetType *string, metadata []byte) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO activities (user_id, type, target_id, target_type, metadata)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, actType, targetID, targetType, metadata,
	)
	if err != nil {
		return fmt.Errorf("ingest activity: %w", err)
	}
	return nil
}

// GetFeed returns a paginated activity feed for viewerID: their own activities plus
// activities from users they follow, ordered newest first.
// cursor is an ISO8601 timestamp; pass "" for the first page.
func (r *ActivityRepository) GetFeed(ctx context.Context, viewerID string, limit int, cursor string) ([]*model.Activity, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.user_id, u.display_name, u.avatar_url,
		       a.type, a.target_id::text, a.target_type, a.metadata, a.created_at
		FROM activities a
		JOIN users u ON u.id = a.user_id
		WHERE a.user_id IN (
			SELECT following_id FROM user_follows WHERE follower_id = $1
			UNION ALL SELECT $1
		)
		AND ($3 = '' OR a.created_at < $3::timestamptz)
		ORDER BY a.created_at DESC
		LIMIT $2
	`, viewerID, limit, cursor)
	if err != nil {
		return nil, fmt.Errorf("get feed: %w", err)
	}
	defer rows.Close()

	var items []*model.Activity
	for rows.Next() {
		var a model.Activity
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.DisplayName, &a.AvatarURL,
			&a.Type, &a.TargetID, &a.TargetType, &a.Metadata, &a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan activity: %w", err)
		}
		items = append(items, &a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("feed rows: %w", err)
	}
	if items == nil {
		items = []*model.Activity{}
	}
	return items, nil
}
