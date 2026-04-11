package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Admin upserts the admin@sub12.local account with the given plaintext password.
// Safe to call on every startup — uses ON CONFLICT to update the hash in place.
func Admin(ctx context.Context, db *pgxpool.Pool, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}

	_, err = db.Exec(ctx, `
		INSERT INTO users (email, display_name, password_hash, bio, location)
		VALUES ('admin@sub12.local', 'Admin', $1, 'Platform administrator', 'Yorkshire')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
	`, string(hash))
	if err != nil {
		return fmt.Errorf("upsert admin user: %w", err)
	}

	return nil
}
