package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LikeRepository struct {
	db *pgxpool.Pool
}

func NewLikeRepository(db *pgxpool.Pool) *LikeRepository {
	return &LikeRepository{db: db}
}

// Like inserts a like. Returns true if a new like was created, false if already exists.
func (r *LikeRepository) Like(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		INSERT INTO likes (user_id, target_id, target_type)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, target_id, target_type) DO NOTHING
	`, userID, targetID, targetType)
	if err != nil {
		return false, fmt.Errorf("insert like: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// Unlike removes a like. Returns true if a like was removed, false if didn't exist.
func (r *LikeRepository) Unlike(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM likes WHERE user_id = $1 AND target_id = $2 AND target_type = $3
	`, userID, targetID, targetType)
	if err != nil {
		return false, fmt.Errorf("delete like: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// IsLiked checks whether a user has liked a target.
func (r *LikeRepository) IsLiked(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND target_id = $2 AND target_type = $3)
	`, userID, targetID, targetType).Scan(&exists)
	return exists, err
}

// IncrementLikeCount increments the like_count on a target table (score_cards, posts, comments).
func (r *LikeRepository) IncrementLikeCount(ctx context.Context, targetID, table string) error {
	query := fmt.Sprintf(`UPDATE %s SET like_count = like_count + 1 WHERE id = $1`, table)
	_, err := r.db.Exec(ctx, query, targetID)
	return err
}

// DecrementLikeCount decrements the like_count on a target table.
func (r *LikeRepository) DecrementLikeCount(ctx context.Context, targetID, table string) error {
	query := fmt.Sprintf(`UPDATE %s SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, table)
	_, err := r.db.Exec(ctx, query, targetID)
	return err
}
