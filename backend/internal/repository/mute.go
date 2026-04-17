package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type MuteRepository struct {
	db *pgxpool.Pool
}

func NewMuteRepository(db *pgxpool.Pool) *MuteRepository {
	return &MuteRepository{db: db}
}

// Mute records that muterID no longer wishes to see mutedID's activity in
// feeds. Idempotent — already-muted is a no-op.
func (r *MuteRepository) Mute(ctx context.Context, muterID, mutedID string) error {
	if muterID == mutedID {
		return fmt.Errorf("cannot mute self")
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_mutes (muter_id, muted_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, muterID, mutedID)
	if err != nil {
		return fmt.Errorf("mute: %w", err)
	}
	return nil
}

// Unmute removes a mute record. Idempotent.
func (r *MuteRepository) Unmute(ctx context.Context, muterID, mutedID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM user_mutes WHERE muter_id = $1 AND muted_id = $2`,
		muterID, mutedID,
	)
	if err != nil {
		return fmt.Errorf("unmute: %w", err)
	}
	return nil
}

// IsMuted reports whether muterID has muted mutedID.
func (r *MuteRepository) IsMuted(ctx context.Context, muterID, mutedID string) (bool, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM user_mutes WHERE muter_id = $1 AND muted_id = $2`,
		muterID, mutedID,
	).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("is muted: %w", err)
	}
	return n > 0, nil
}

// ListMuted returns the IDs of users the given user has muted.
func (r *MuteRepository) ListMuted(ctx context.Context, muterID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT muted_id FROM user_mutes WHERE muter_id = $1 ORDER BY created_at DESC`,
		muterID,
	)
	if err != nil {
		return nil, fmt.Errorf("list muted: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan muted: %w", err)
		}
		ids = append(ids, id)
	}
	if ids == nil {
		ids = []string{}
	}
	return ids, nil
}
