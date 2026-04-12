package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EmailChangeTokenRepository struct {
	db *pgxpool.Pool
}

func NewEmailChangeTokenRepository(db *pgxpool.Pool) *EmailChangeTokenRepository {
	return &EmailChangeTokenRepository{db: db}
}

func (r *EmailChangeTokenRepository) Create(ctx context.Context, userID, newEmail, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3, $4)
	`, userID, newEmail, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("create email change token: %w", err)
	}
	return nil
}

// Consume marks the token as used and returns the user ID and new email.
func (r *EmailChangeTokenRepository) Consume(ctx context.Context, tokenHash string) (string, string, error) {
	var userID, newEmail string
	err := r.db.QueryRow(ctx, `
		UPDATE email_change_tokens
		SET used_at = NOW()
		WHERE token_hash = $1
		  AND used_at IS NULL
		  AND expires_at > NOW()
		RETURNING user_id::text, new_email
	`, tokenHash).Scan(&userID, &newEmail)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", ErrNotFound
		}
		return "", "", fmt.Errorf("consume email change token: %w", err)
	}
	return userID, newEmail, nil
}
