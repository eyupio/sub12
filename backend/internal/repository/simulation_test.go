package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// These tests exercise the simulation repository against a live PostgreSQL
// instance. They are skipped unless SIM_DB_TEST=1 is set and a usable DSN can be
// built from the standard DB_* env vars (the same ones `make migrate` uses).
// Run locally with: SIM_DB_TEST=1 make dev && (cd backend && SIM_DB_TEST=1 go test ./internal/repository/...)

func simTestPool(t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	if os.Getenv("SIM_DB_TEST") != "1" {
		t.Skip("set SIM_DB_TEST=1 to run simulation repository integration tests")
	}
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}
	name := os.Getenv("DB_NAME")
	if name == "" {
		name = "sub12"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "sub12"
	}
	pw := os.Getenv("DB_PASSWORD")
	dsn := "postgres://" + user + ":" + pw + "@" + host + ":" + port + "/" + name + "?sslmode=disable"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "connect to test DB")
	require.NoError(t, pool.Ping(ctx), "ping test DB")
	return pool, func() { pool.Close() }
}

func TestSimSettingsRoundTrip(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	settings, err := repo.GetSettings(ctx)
	require.NoError(t, err)
	// The singleton row should always exist after migration 000100.
	assert.Equal(t, 1, settings.ID)

	// Hourly multipliers should decode to a 24-element slice.
	if assert.NotNil(t, settings.HourlyMultipliers) {
		assert.Len(t, settings.HourlyMultipliers, 24)
	}

	// Upsert with a custom multiplier slice and new weights, then read back.
	updated, err := repo.UpsertSettings(ctx, &model.UpsertSimulationSettingsInput{
		Enabled:             settings.Enabled,
		PersonaCount:        settings.PersonaCount,
		ActionsPerHour:      settings.ActionsPerHour,
		PostWeight:          settings.PostWeight,
		LikeWeight:          settings.LikeWeight,
		CommentWeight:       settings.CommentWeight,
		FollowWeight:        settings.FollowWeight,
		UnfollowWeight:      3,
		ShareWeight:         2,
		ActiveStartHour:     settings.ActiveStartHour,
		ActiveEndHour:       settings.ActiveEndHour,
		MaxCardsPerPersona:  settings.MaxCardsPerPersona,
		HourlyMultipliers:   []float64{0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 0, 0, 0},
		IncludeInPublicStats: settings.IncludeInPublicStats,
	}, "00000000-0000-0000-0000-000000000000")
	require.NoError(t, err)
	assert.Equal(t, 3, updated.UnfollowWeight)
	assert.Equal(t, 2, updated.ShareWeight)
	require.Len(t, updated.HourlyMultipliers, 24)
	assert.Equal(t, 2.0, updated.HourlyMultipliers[16])
	assert.Equal(t, 0.0, updated.HourlyMultipliers[0])
}

func TestSimTouchTickAndCounts(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.TouchTick(ctx))
	st, err := repo.GetSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, st.LastTickAt)
	assert.WithinDuration(t, time.Now().UTC(), *st.LastTickAt, 5*time.Second)

	before := st.ShareCount
	require.NoError(t, repo.IncrementCounts(ctx, map[string]int{"share": 1, "unfollow": 1}, "share", ""))
	st, err = repo.GetSettings(ctx)
	require.NoError(t, err)
	assert.Equal(t, before+1, st.ShareCount)
}

func TestSimAuditAppend(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.RecordAudit(ctx, "run_now", "00000000-0000-0000-0000-000000000000", `{"actions":1}`))
	entries, total, err := repo.ListAudit(ctx, 10, 0)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, 1)
	if assert.NotEmpty(t, entries) {
		assert.Equal(t, "run_now", entries[0].Event)
	}
}
