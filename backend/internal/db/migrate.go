package db

import (
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies all pending up migrations.
// dbURL must be a pgx5:// URL, e.g. pgx5://user:pass@host:5432/db?sslmode=disable
func Migrate(dbURL string) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("load migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, dbURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	// If the database is dirty from a previously failed migration,
	// force the version so migrations can be re-applied.
	version, dirty, verr := m.Version()
	if verr == nil && dirty {
		if ferr := m.Force(int(version)); ferr != nil {
			return fmt.Errorf("force dirty version %d: %w", version, ferr)
		}
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", err)
	}

	return nil
}
