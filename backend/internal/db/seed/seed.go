package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Admin upserts the support@sub12.io account with the given plaintext password.
// Safe to call on every startup — uses ON CONFLICT to update the hash in place.
func Admin(ctx context.Context, db *pgxpool.Pool, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}

	_, err = db.Exec(ctx, `
		INSERT INTO users (email, display_name, password_hash, role, bio, location)
		VALUES ('support@sub12.io', 'Admin', $1, 'admin', 'Platform administrator', 'Yorkshire')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', updated_at = NOW()
	`, string(hash))
	if err != nil {
		return fmt.Errorf("upsert admin user: %w", err)
	}

	return nil
}
