package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// likeTables is the fixed set of tables likes can target. The table name is
// interpolated into SQL, so this whitelist prevents injection via targetType.
var likeTables = map[string]string{
	"score_card": "score_cards",
	"post":       "posts",
	"comment":    "comments",
}

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

// LikeTx inserts a like and increments the target's like_count in a single
// transaction, preventing counter drift under concurrent calls. Returns true if
// a new like row was created.
func (r *LikeRepository) LikeTx(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	table, ok := likeTables[targetType]
	if !ok {
		return false, fmt.Errorf("invalid like target type: %s", targetType)
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, fmt.Errorf("begin like tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx, `
		INSERT INTO likes (user_id, target_id, target_type)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, target_id, target_type) DO NOTHING
	`, userID, targetID, targetType)
	if err != nil {
		return false, fmt.Errorf("insert like: %w", err)
	}
	created := tag.RowsAffected() > 0
	if created {
		if _, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE %s SET like_count = like_count + 1 WHERE id = $1`, table),
			targetID,
		); err != nil {
			return false, fmt.Errorf("increment like_count: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit like tx: %w", err)
	}
	return created, nil
}

// UnlikeTx removes a like and decrements the target's like_count in a single
// transaction. Returns true if a like row was removed.
func (r *LikeRepository) UnlikeTx(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	table, ok := likeTables[targetType]
	if !ok {
		return false, fmt.Errorf("invalid like target type: %s", targetType)
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, fmt.Errorf("begin unlike tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx, `
		DELETE FROM likes WHERE user_id = $1 AND target_id = $2 AND target_type = $3
	`, userID, targetID, targetType)
	if err != nil {
		return false, fmt.Errorf("delete like: %w", err)
	}
	removed := tag.RowsAffected() > 0
	if removed {
		if _, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE %s SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, table),
			targetID,
		); err != nil {
			return false, fmt.Errorf("decrement like_count: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit unlike tx: %w", err)
	}
	return removed, nil
}

// CountGivenByUser returns the total number of likes a user has given.
func (r *LikeRepository) CountGivenByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM likes WHERE user_id = $1
	`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count likes given: %w", err)
	}
	return count, nil
}

// CountReceivedByOwner returns the total number of likes received on all content
// owned by userID (score_cards and posts).
func (r *LikeRepository) CountReceivedByOwner(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(like_count), 0)
		FROM (
			SELECT like_count FROM score_cards WHERE user_id = $1
			UNION ALL
			SELECT like_count FROM posts WHERE user_id = $1
		) t
	`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count likes received: %w", err)
	}
	return count, nil
}
