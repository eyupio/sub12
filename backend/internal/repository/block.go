package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type BlockRepository struct {
	db *pgxpool.Pool
}

func NewBlockRepository(db *pgxpool.Pool) *BlockRepository {
	return &BlockRepository{db: db}
}

// Block creates a block relationship. Idempotent (ON CONFLICT DO NOTHING).
func (r *BlockRepository) Block(ctx context.Context, blockerID, blockedID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		blockerID, blockedID,
	)
	if err != nil {
		return fmt.Errorf("block user: %w", err)
	}
	return nil
}

// Unblock removes a block relationship. Returns ErrNotFound if it didn't exist.
func (r *BlockRepository) Unblock(ctx context.Context, blockerID, blockedID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
		blockerID, blockedID,
	)
	if err != nil {
		return fmt.Errorf("unblock user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IsBlocked returns true if either user has blocked the other.
func (r *BlockRepository) IsBlocked(ctx context.Context, userA, userB string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM user_blocks
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)`,
		userA, userB,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("is blocked: %w", err)
	}
	return exists, nil
}

// ListBlocked returns all users blocked by blockerID.
func (r *BlockRepository) ListBlocked(ctx context.Context, blockerID string) ([]*model.UserBlock, error) {
	rows, err := r.db.Query(ctx,
		`SELECT ub.blocker_id, ub.blocked_id, u.display_name, u.avatar_url, ub.created_at
		 FROM user_blocks ub
		 JOIN users u ON u.id = ub.blocked_id
		 WHERE ub.blocker_id = $1
		 ORDER BY ub.created_at DESC`,
		blockerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list blocked: %w", err)
	}
	defer rows.Close()

	var blocks []*model.UserBlock
	for rows.Next() {
		var b model.UserBlock
		if err := rows.Scan(&b.BlockerID, &b.BlockedID, &b.DisplayName, &b.AvatarURL, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan block: %w", err)
		}
		blocks = append(blocks, &b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list blocked rows: %w", err)
	}
	if blocks == nil {
		blocks = []*model.UserBlock{}
	}
	return blocks, nil
}
