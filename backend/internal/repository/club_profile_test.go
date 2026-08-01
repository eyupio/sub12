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

// These tests exercise the club profile, directory filters and opening hours
// against a live PostgreSQL instance. They are skipped unless CLUB_DB_TEST=1 is
// set and a usable DSN can be built from the standard DB_* env vars.
// Run locally with: make dev && (cd backend && CLUB_DB_TEST=1 go test ./internal/repository/...)
// The pool is closed via t.Cleanup rather than a returned func so it is torn
// down *after* the row cleanups registered by later helpers — cleanups run
// last-registered-first, and a closed pool would silently swallow every DELETE
// and leave the next run to trip over its own leftovers.
func clubTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("CLUB_DB_TEST") != "1" {
		t.Skip("set CLUB_DB_TEST=1 to run club repository integration tests")
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
	dsn := "postgres://" + user + ":" + os.Getenv("DB_PASSWORD") + "@" + host + ":" + port + "/" + name + "?sslmode=disable"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "connect to test DB")
	require.NoError(t, pool.Ping(ctx), "ping test DB")
	t.Cleanup(pool.Close)
	return pool
}

// newClubTestUser inserts a throwaway user and registers its cleanup. Any row
// left behind by an interrupted run is cleared first so the suite is always
// re-runnable against the same database.
func newClubTestUser(t *testing.T, pool *pgxpool.Pool, email string) string {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `DELETE FROM clubs WHERE created_by IN (SELECT id FROM users WHERE email = $1)`, email)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)

	var id string
	err = pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, 'x', 'Club Test User')
		RETURNING id
	`, email).Scan(&id)
	require.NoError(t, err)
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id); err != nil {
			t.Logf("cleanup test user %s: %v", email, err)
		}
	})
	return id
}

func TestClubProfileRoundTrip(t *testing.T) {
	pool := clubTestPool(t)
	repo := NewClubRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "club-profile-owner@example.test")
	club, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Profile Test Club"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM clubs WHERE id = $1`, club.ID) })

	// A brand new club has empty (not nil) profile lists and no league.
	assert.Equal(t, []string{}, club.Disciplines)
	assert.Equal(t, 0, club.LeagueCount)

	str := func(s string) *string { return &s }
	f := func(v float64) *float64 { return &v }
	year := 1978
	updated, err := repo.AdminUpdate(ctx, club.ID, &model.UpdateClubInput{
		WebsiteURL:      str("https://example.test"),
		ContactEmail:    str("info@example.test"),
		City:            str("Huddersfield"),
		Postcode:        str("HD3 3FR"),
		Latitude:        f(53.6458),
		Longitude:       f(-1.8412),
		Disciplines:     &[]string{"air rifle", "benchrest"},
		Facilities:      &[]string{"Covered firing line"},
		EstablishedYear: &year,
	})
	require.NoError(t, err)
	assert.Equal(t, "https://example.test", *updated.WebsiteURL)
	assert.Equal(t, "Huddersfield", *updated.City)
	assert.Equal(t, []string{"air rifle", "benchrest"}, updated.Disciplines)
	assert.Equal(t, 1978, *updated.EstablishedYear)
	require.NotNil(t, updated.Latitude)
	assert.InDelta(t, 53.6458, *updated.Latitude, 0.0001)

	// An empty string clears a text field; omitted fields are untouched.
	cleared, err := repo.AdminUpdate(ctx, club.ID, &model.UpdateClubInput{ContactEmail: str("")})
	require.NoError(t, err)
	assert.Nil(t, cleared.ContactEmail)
	assert.Equal(t, "Huddersfield", *cleared.City, "omitted field must survive")

	// Coordinates only clear via the explicit flag.
	noCoords, err := repo.AdminUpdate(ctx, club.ID, &model.UpdateClubInput{ClearCoordinates: true})
	require.NoError(t, err)
	assert.Nil(t, noCoords.Latitude)
	assert.Nil(t, noCoords.Longitude)
}

func TestClubDirectoryFilters(t *testing.T) {
	pool := clubTestPool(t)
	repo := NewClubRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "club-directory-owner@example.test")
	near, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Directory Near Club"})
	require.NoError(t, err)
	far, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Directory Far Club"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM clubs WHERE id = ANY($1)`, []string{near.ID, far.ID}) })

	f := func(v float64) *float64 { return &v }
	_, err = repo.AdminUpdate(ctx, near.ID, &model.UpdateClubInput{
		City:        strPtr("Huddersfield"),
		Latitude:    f(53.6458),
		Longitude:   f(-1.8412),
		Disciplines: &[]string{"air rifle"},
	})
	require.NoError(t, err)
	_, err = repo.AdminUpdate(ctx, far.ID, &model.UpdateClubInput{
		City:        strPtr("Penzance"),
		Latitude:    f(50.1186),
		Longitude:   f(-5.5372),
		Disciplines: &[]string{"fullbore"},
	})
	require.NoError(t, err)

	find := func(clubs []*model.Club, id string) *model.Club {
		for _, c := range clubs {
			if c.ID == id {
				return c
			}
		}
		return nil
	}

	// Free-text search matches the town, not just the name.
	byTown, err := repo.List(ctx, "", model.ClubDirectoryQuery{Search: "hudders"})
	require.NoError(t, err)
	assert.NotNil(t, find(byTown, near.ID))
	assert.Nil(t, find(byTown, far.ID))

	// Discipline filter is an exact array-containment match.
	byDiscipline, err := repo.List(ctx, "", model.ClubDirectoryQuery{Discipline: "fullbore"})
	require.NoError(t, err)
	assert.Nil(t, find(byDiscipline, near.ID))
	assert.NotNil(t, find(byDiscipline, far.ID))

	// Proximity populates distance_km and a radius excludes the far club.
	fromLeeds := model.ClubDirectoryQuery{Latitude: f(53.8008), Longitude: f(-1.5491)}
	byDistance, err := repo.List(ctx, "", fromLeeds)
	require.NoError(t, err)
	gotNear := find(byDistance, near.ID)
	gotFar := find(byDistance, far.ID)
	require.NotNil(t, gotNear)
	require.NotNil(t, gotFar)
	require.NotNil(t, gotNear.DistanceKM)
	require.NotNil(t, gotFar.DistanceKM)
	assert.InDelta(t, 25, *gotNear.DistanceKM, 15, "Huddersfield is roughly 25km from Leeds")
	assert.Less(t, *gotNear.DistanceKM, *gotFar.DistanceKM)

	fromLeeds.RadiusKM = f(100)
	withinRadius, err := repo.List(ctx, "", fromLeeds)
	require.NoError(t, err)
	assert.NotNil(t, find(withinRadius, near.ID))
	assert.Nil(t, find(withinRadius, far.ID))
}

func TestClubOpeningHoursReplace(t *testing.T) {
	pool := clubTestPool(t)
	repo := NewClubRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "club-hours-owner@example.test")
	club, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Opening Hours Club"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM clubs WHERE id = $1`, club.ID) })

	empty, err := repo.ListOpeningHours(ctx, club.ID)
	require.NoError(t, err)
	assert.Empty(t, empty)

	require.NoError(t, repo.ReplaceOpeningHours(ctx, club.ID, []model.ClubOpeningHoursInput{
		{DayOfWeek: 5, OpensAt: strPtr("10:00"), ClosesAt: strPtr("15:00")},
		{DayOfWeek: 0, IsClosed: true, Note: strPtr("Pre-booked sessions only")},
		{DayOfWeek: 5, OpensAt: strPtr("18:00"), ClosesAt: strPtr("21:00")},
	}))

	hours, err := repo.ListOpeningHours(ctx, club.ID)
	require.NoError(t, err)
	require.Len(t, hours, 3)
	// Monday first, then Saturday's two slots earliest-first.
	assert.Equal(t, 0, hours[0].DayOfWeek)
	assert.True(t, hours[0].IsClosed)
	assert.Equal(t, "Pre-booked sessions only", *hours[0].Note)
	assert.Equal(t, "10:00", *hours[1].OpensAt)
	assert.Equal(t, "18:00", *hours[2].OpensAt)

	// Replacing swaps the whole week rather than appending.
	require.NoError(t, repo.ReplaceOpeningHours(ctx, club.ID, []model.ClubOpeningHoursInput{
		{DayOfWeek: 2, OpensAt: strPtr("19:00"), ClosesAt: strPtr("21:30")},
	}))
	hours, err = repo.ListOpeningHours(ctx, club.ID)
	require.NoError(t, err)
	require.Len(t, hours, 1)
	assert.Equal(t, 2, hours[0].DayOfWeek)
}

// mustExec runs a cleanup statement and reports, rather than swallows, a
// failure — a silently skipped cleanup wedges the next run.
func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Logf("cleanup %q: %v", sql, err)
	}
}

func strPtr(s string) *string { return &s }
