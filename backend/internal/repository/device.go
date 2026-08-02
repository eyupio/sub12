package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DeviceRepository struct {
	db *pgxpool.Pool
}

func NewDeviceRepository(db *pgxpool.Pool) *DeviceRepository {
	return &DeviceRepository{db: db}
}

// Upsert registers or refreshes a device token. The token is unique, so a
// re-registration (including by a different user on a shared device) reassigns
// the row rather than duplicating it.
func (r *DeviceRepository) Upsert(ctx context.Context, userID, token, platform string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO device_tokens (user_id, token, platform)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (token)
		 DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
		userID, token, platform,
	)
	if err != nil {
		return fmt.Errorf("upsert device token: %w", err)
	}
	return nil
}

// Delete removes a device token for the given user. Scoping the delete to the
// owner prevents one user from unregistering another's device. Returns
// ErrNotFound when no matching row exists.
func (r *DeviceRepository) Delete(ctx context.Context, userID, token string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`,
		userID, token,
	)
	if err != nil {
		return fmt.Errorf("delete device token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListTokensByUsers returns the push tokens registered to any of the given
// users, in one query. Used by announcement fan-out, where per-user lookups
// would be one round trip per recipient.
func (r *DeviceRepository) ListTokensByUsers(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx,
		`SELECT token FROM device_tokens WHERE user_id = ANY($1)`,
		userIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("list device tokens for users: %w", err)
	}
	defer rows.Close()
	var tokens []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, fmt.Errorf("scan device token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// ListTokensByUser returns all push tokens registered to a user.
func (r *DeviceRepository) ListTokensByUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT token FROM device_tokens WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list device tokens: %w", err)
	}
	defer rows.Close()

	var tokens []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, fmt.Errorf("scan device token: %w", err)
		}
		tokens = append(tokens, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list device tokens rows: %w", err)
	}
	return tokens, nil
}
