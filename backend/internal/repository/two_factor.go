package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TwoFactorRepository struct {
	db *pgxpool.Pool
}

func NewTwoFactorRepository(db *pgxpool.Pool) *TwoFactorRepository {
	return &TwoFactorRepository{db: db}
}

// SetSecretAndEnable persists the confirmed TOTP secret and flips the enabled
// flag. Run inside the same logical operation that records backup codes so
// partial enrollment never leaves a user with a secret but no recovery codes.
func (r *TwoFactorRepository) SetSecretAndEnable(ctx context.Context, userID, secret string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE users
		SET totp_secret      = $2,
		    totp_enabled     = TRUE,
		    totp_enrolled_at = NOW(),
		    updated_at       = NOW()
		WHERE id = $1
	`, userID, secret)
	if err != nil {
		return fmt.Errorf("set totp secret: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *TwoFactorRepository) Disable(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET totp_secret      = NULL,
		    totp_enabled     = FALSE,
		    totp_enrolled_at = NULL,
		    updated_at       = NOW()
		WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("disable totp: %w", err)
	}
	return nil
}

// GetSecret returns the stored TOTP secret and the enabled flag for a user.
// Both come from the users row; the secret may be set without enabled=true
// during the brief window between SetSecretAndEnable and a failed write.
func (r *TwoFactorRepository) GetSecret(ctx context.Context, userID string) (string, bool, error) {
	var (
		secret  *string
		enabled bool
	)
	err := r.db.QueryRow(ctx, `SELECT totp_secret, totp_enabled FROM users WHERE id = $1`, userID).Scan(&secret, &enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, ErrNotFound
		}
		return "", false, fmt.Errorf("get totp secret: %w", err)
	}
	if secret == nil {
		return "", enabled, nil
	}
	return *secret, enabled, nil
}

// InsertBackupCodes persists a batch of bcrypt-hashed backup codes.
func (r *TwoFactorRepository) InsertBackupCodes(ctx context.Context, userID string, hashes []string) error {
	if len(hashes) == 0 {
		return nil
	}
	placeholders := make([]string, 0, len(hashes))
	args := make([]any, 0, len(hashes)+1)
	args = append(args, userID)
	for i, h := range hashes {
		placeholders = append(placeholders, fmt.Sprintf("($1, $%d)", i+2))
		args = append(args, h)
	}
	q := "INSERT INTO user_backup_codes (user_id, code_hash) VALUES " + strings.Join(placeholders, ", ")
	if _, err := r.db.Exec(ctx, q, args...); err != nil {
		return fmt.Errorf("insert backup codes: %w", err)
	}
	return nil
}

// ListUnusedHashes returns every unused backup-code hash for the user. The
// caller bcrypt-compares each against the candidate code; this is unavoidable
// because each hash carries its own salt and cannot be looked up by the
// plaintext code.
func (r *TwoFactorRepository) ListUnusedHashes(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT code_hash FROM user_backup_codes
		WHERE user_id = $1 AND used_at IS NULL
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list backup codes: %w", err)
	}
	defer rows.Close()
	var hashes []string
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return nil, fmt.Errorf("scan backup code: %w", err)
		}
		hashes = append(hashes, h)
	}
	return hashes, rows.Err()
}

// ConsumeBackupCodeByHash marks a single backup-code row as used. The UPDATE
// returns the row id only when the code was previously unused, so a replay
// attempt against the same code reports false.
func (r *TwoFactorRepository) ConsumeBackupCodeByHash(ctx context.Context, userID, hash string) (bool, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		UPDATE user_backup_codes
		SET used_at = NOW()
		WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
		RETURNING id
	`, userID, hash).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("consume backup code: %w", err)
	}
	return true, nil
}

func (r *TwoFactorRepository) CountUnused(ctx context.Context, userID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_backup_codes
		WHERE user_id = $1 AND used_at IS NULL
	`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count backup codes: %w", err)
	}
	return n, nil
}

func (r *TwoFactorRepository) DeleteAll(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_backup_codes WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("delete backup codes: %w", err)
	}
	return nil
}
