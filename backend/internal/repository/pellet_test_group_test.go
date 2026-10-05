package repository

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// UpdateGroup once passed userID as an argument the statement never
// referenced. Postgres cannot infer an unused placeholder's type and rejects
// the whole statement ("could not determine data type of parameter $3"), so
// every group edit 500'd. Only Postgres resolves parameter types, so this has
// to run against a real database — skipped unless one is configured, as CI's
// backend job provides.
func TestUpdateGroup_PersistsAndPreservesUnsetFields(t *testing.T) {
	pool := testPool(t)
	repo := NewPelletTestRepository(pool)
	ctx := context.Background()

	userID := newTestUser(t, pool, "pellet-group", testName(t, "tester"))

	var rifleID, pelletID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO rifles (user_id, make, model) VALUES ($1, 'Air Arms', 'S510') RETURNING id`,
		userID).Scan(&rifleID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO pellets (user_id, brand, model) VALUES ($1, 'JSB', 'Exact') RETURNING id`,
		userID).Scan(&pelletID))

	session, err := repo.Create(ctx, userID, &model.CreatePelletTestSessionInput{
		RifleID:       rifleID,
		PelletID:      pelletID,
		TestDate:      "2026-08-01",
		DistanceValue: 25,
		DistanceUnit:  "meters",
	}, 25)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM pellet_test_sessions WHERE id = $1`, session.ID)
		_, _ = pool.Exec(ctx, `DELETE FROM rifles WHERE id = $1`, rifleID)
		_, _ = pool.Exec(ctx, `DELETE FROM pellets WHERE id = $1`, pelletID)
	})

	notes := "before"
	group, err := repo.CreateGroup(ctx, session.ID, userID, &model.CreatePelletTestGroupInput{
		ShotCount:   5,
		GroupSizeMM: 12.5,
		Notes:       &notes,
	})
	require.NoError(t, err)

	shotCount, sizeMM := 10, 9.0
	updated, err := repo.UpdateGroup(ctx, group.ID, session.ID, userID, &model.UpdatePelletTestGroupInput{
		ShotCount:   &shotCount,
		GroupSizeMM: &sizeMM,
	})
	require.NoError(t, err)
	assert.Equal(t, 10, updated.ShotCount)
	assert.InDelta(t, 9.0, updated.GroupSizeMM, 0.001)
	// Every field is COALESCEd against its current value, so an omitted one
	// must survive the update rather than being nulled out.
	require.NotNil(t, updated.Notes)
	assert.Equal(t, "before", *updated.Notes)

	// A group belonging to someone else's session must not be reachable.
	otherID := newTestUser(t, pool, "pellet-group-other", testName(t, "other"))
	_, err = repo.UpdateGroup(ctx, group.ID, session.ID, otherID, &model.UpdatePelletTestGroupInput{
		ShotCount: &shotCount,
	})
	assert.ErrorIs(t, err, ErrNotFound)
}

// pellet_test_images.group_id is a bare FK to pellet_test_groups, which accepts
// any group in the database. A photo must only be filed under a group of its
// own session, or it reads the other session's group size back through the
// gallery join.
func TestCreateImage_RejectsGroupOfAnotherSession(t *testing.T) {
	pool := testPool(t)
	repo := NewPelletTestRepository(pool)
	ctx := context.Background()

	userID := newTestUser(t, pool, "pellet-img-grp", testName(t, "tester"))
	var rifleID, pelletID, imageID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO rifles (user_id, make, model) VALUES ($1, 'Air Arms', 'S510') RETURNING id`, userID).Scan(&rifleID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO pellets (user_id, brand, model) VALUES ($1, 'JSB', 'Exact') RETURNING id`, userID).Scan(&pelletID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO images (user_id, data, content_type, size_bytes) VALUES ($1, '\x00', 'image/png', 1) RETURNING id`, userID).Scan(&imageID))

	newSession := func() *model.PelletTestSession {
		s, err := repo.Create(ctx, userID, &model.CreatePelletTestSessionInput{
			RifleID: rifleID, PelletID: pelletID, TestDate: "2026-08-01",
			DistanceValue: 25, DistanceUnit: "meters",
		}, 25)
		require.NoError(t, err)
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM pellet_test_sessions WHERE id = $1`, s.ID) })
		return s
	}
	a, b := newSession(), newSession()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM images WHERE id = $1`, imageID)
		_, _ = pool.Exec(ctx, `DELETE FROM rifles WHERE id = $1`, rifleID)
		_, _ = pool.Exec(ctx, `DELETE FROM pellets WHERE id = $1`, pelletID)
	})

	groupB, err := repo.CreateGroup(ctx, b.ID, userID, &model.CreatePelletTestGroupInput{ShotCount: 5, GroupSizeMM: 12.5})
	require.NoError(t, err)

	_, err = repo.CreateImage(ctx, a.ID, userID, imageID, &groupB.ID, nil)
	assert.ErrorIs(t, err, ErrNotFound)

	img, err := repo.CreateImage(ctx, b.ID, userID, imageID, &groupB.ID, nil)
	require.NoError(t, err)
	require.NotNil(t, img.GroupID)
	assert.Equal(t, groupB.ID, *img.GroupID)
}
