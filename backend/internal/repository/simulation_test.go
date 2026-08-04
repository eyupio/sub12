package repository

import (
	"context"
	"fmt"
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

// simTestActor inserts a throwaway user and returns its id, for the columns
// that carry a real foreign key to users (settings.updated_by, audit.actor_id).
func simTestActor(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	var id string
	email := fmt.Sprintf("simtest-actor-%s@example.test", t.Name())
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (email, display_name, password_hash) VALUES ($1, 'Sim Test Actor', 'x')
		 ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
		 RETURNING id::text`, email).Scan(&id))
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

func TestSimSettingsRoundTrip(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	settings, err := repo.GetSettings(ctx)
	require.NoError(t, err)
	// The singleton row should always exist after migration 000100.
	assert.Equal(t, int16(1), settings.ID)

	// Hourly multipliers should decode to a 24-element slice.
	if assert.NotNil(t, settings.HourlyMultipliers) {
		assert.Len(t, settings.HourlyMultipliers, 24)
	}

	// Upsert with a custom multiplier slice and new weights, then read back.
	updated, err := repo.UpsertSettings(ctx, &model.UpsertSimulationSettingsInput{
		Enabled:              settings.Enabled,
		PersonaCount:         settings.PersonaCount,
		ActionsPerHour:       settings.ActionsPerHour,
		PostWeight:           settings.PostWeight,
		LikeWeight:           settings.LikeWeight,
		CommentWeight:        settings.CommentWeight,
		FollowWeight:         settings.FollowWeight,
		UnfollowWeight:       3,
		ShareWeight:          2,
		ActiveStartHour:      settings.ActiveStartHour,
		ActiveEndHour:        settings.ActiveEndHour,
		MaxCardsPerPersona:   settings.MaxCardsPerPersona,
		HourlyMultipliers:    []float64{0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 0, 0, 0},
		IncludeInPublicStats: settings.IncludeInPublicStats,
		BackdateDays:         30,
		WeekendBias:          60,
		AwayDayChance:        10,
		ReplyChance:          25,
		SessionActions:       4,
		PersonaHistoryDays:   180,
	}, simTestActor(t, pool))
	require.NoError(t, err)
	assert.Equal(t, 3, updated.UnfollowWeight)
	assert.Equal(t, 2, updated.ShareWeight)
	// The realism controls survive the round trip.
	assert.Equal(t, 30, updated.BackdateDays)
	assert.Equal(t, 60, updated.WeekendBias)
	assert.Equal(t, 10, updated.AwayDayChance)
	assert.Equal(t, 25, updated.ReplyChance)
	assert.Equal(t, 4, updated.SessionActions)
	assert.Equal(t, 180, updated.PersonaHistoryDays)
	reread, err := repo.GetSettings(ctx)
	require.NoError(t, err)
	assert.Equal(t, 30, reread.BackdateDays)
	assert.Equal(t, 4, reread.SessionActions)
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

// A stalled engine explains itself through last_error, and the batch that
// follows is usually a clean one — likes and comments carry on long after the
// card cap has stopped the posting. Blanking the message on that next batch is
// what left the admin with "enabled, ticking, nothing happening" and no reason.
func TestSimLastErrorSurvivesTheNextCleanBatch(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.IncrementCounts(ctx, map[string]int{}, "", "roster is at the card cap"))
	st, err := repo.GetSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, st.LastError)
	assert.Equal(t, "roster is at the card cap", *st.LastError)
	firstAt := st.LastErrorAt

	require.NoError(t, repo.IncrementCounts(ctx, map[string]int{"like": 1}, "like", ""))
	st, err = repo.GetSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, st.LastError, "a clean batch must not erase the reason the engine stalled")
	assert.Equal(t, "roster is at the card cap", *st.LastError)
	assert.Equal(t, firstAt, st.LastErrorAt, "the timestamp still reports when it was raised")

	// A newer error supersedes it.
	require.NoError(t, repo.IncrementCounts(ctx, map[string]int{}, "", "post failed"))
	st, err = repo.GetSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, st.LastError)
	assert.Equal(t, "post failed", *st.LastError)

	// Saving the settings is the admin acting on it, and clears it.
	_, err = repo.UpsertSettings(ctx, &model.UpsertSimulationSettingsInput{
		PersonaCount: 1, ActionsPerHour: 1, LikeWeight: 1, ActiveEndHour: 24,
		SessionActions: 1,
	}, simTestActor(t, pool))
	require.NoError(t, err)
	st, err = repo.GetSettings(ctx)
	require.NoError(t, err)
	assert.Nil(t, st.LastError)
	assert.Nil(t, st.LastErrorAt)
}

func TestSimAuditAppend(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.RecordAudit(ctx, "run_now", simTestActor(t, pool), `{"actions":1}`))
	entries, total, err := repo.ListAudit(ctx, 10, 0)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, 1)
	if assert.NotEmpty(t, entries) {
		assert.Equal(t, "run_now", entries[0].Event)
	}
}

// TestSimPersonaProvisioningAndTargets exercises the persona provisioning and
// target-selection queries. Each is assembled from concatenated WHERE clauses,
// so a syntax slip or a mis-numbered parameter would otherwise only show up at
// runtime with the engine enabled.
func TestSimPersonaProvisioningAndTargets(t *testing.T) {
	pool, cleanup := simTestPool(t)
	defer cleanup()
	repo := NewSimulationRepository(pool)
	ctx := context.Background()

	// Work from a clean roster so counts and ordering are deterministic. The
	// cascade takes the personas' content with them.
	_, err := pool.Exec(ctx, `DELETE FROM users WHERE is_simulated`)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE is_simulated`)
	})

	older := time.Now().UTC().AddDate(0, 0, -120)
	newer := time.Now().UTC().AddDate(0, 0, -10)
	alice, err := repo.CreateSimulatedUser(ctx, "sim-alice@simulated.local", "Sim Alice", "x", older)
	require.NoError(t, err)
	bob, err := repo.CreateSimulatedUser(ctx, "sim-bob@simulated.local", "Sim Bob", "x", newer)
	require.NoError(t, err)

	t.Run("join dates are stored as given, oldest first", func(t *testing.T) {
		seeds, err := repo.ListSimulatedPersonaSeeds(ctx, 10)
		require.NoError(t, err)
		require.Len(t, seeds, 2)
		assert.Equal(t, alice, seeds[0].ID)
		// Back-dated rather than defaulted to NOW(), so profiles read as
		// established members.
		assert.WithinDuration(t, older, seeds[0].JoinedAt, time.Minute)
		assert.WithinDuration(t, newer, seeds[1].JoinedAt, time.Minute)
	})

	t.Run("display names are listed for collision avoidance", func(t *testing.T) {
		names, err := repo.ListDisplayNames(ctx)
		require.NoError(t, err)
		assert.Contains(t, names, "Sim Alice")
		assert.Contains(t, names, "Sim Bob")
	})

	cardID := insertSimTestCard(t, pool, alice, 231, 9)

	t.Run("card selection carries the score", func(t *testing.T) {
		card, err := repo.RandomPublicCard(ctx, bob, true, false)
		require.NoError(t, err)
		assert.Equal(t, cardID, card.ID)
		assert.Equal(t, alice, card.OwnerID)
		assert.Equal(t, int16(231), card.TotalScore)
		assert.Equal(t, int16(9), card.XCount)

		// The owner is never handed their own card to react to.
		_, err = repo.RandomPublicCard(ctx, alice, true, false)
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("the like path skips what the actor already liked", func(t *testing.T) {
		// Still eligible before Bob has liked it.
		_, err := repo.RandomPublicCard(ctx, bob, true, true)
		require.NoError(t, err)

		_, err = pool.Exec(ctx,
			`INSERT INTO likes (user_id, target_id, target_type) VALUES ($1, $2, 'score_card')`,
			bob, cardID)
		require.NoError(t, err)

		// A re-like changes nothing on the site, so the card must drop out of the
		// like pool entirely rather than be handed back and counted as an action.
		_, err = repo.RandomPublicCard(ctx, bob, true, true)
		assert.ErrorIs(t, err, ErrNotFound)

		// Commenting and sharing are unaffected — those are not one-per-person.
		_, err = repo.RandomPublicCard(ctx, bob, true, false)
		assert.NoError(t, err)

		_, err = pool.Exec(ctx, `DELETE FROM likes WHERE user_id = $1 AND target_id = $2`, bob, cardID)
		require.NoError(t, err)
	})

	t.Run("follow graph preferences", func(t *testing.T) {
		// With no follows recorded, there is nobody to follow back and no
		// friend-of-friend, but a stranger is still available.
		_, err := repo.RandomFollowBackTarget(ctx, alice, true)
		assert.ErrorIs(t, err, ErrNotFound)
		_, err = repo.RandomMutualFollowTarget(ctx, alice, true)
		assert.ErrorIs(t, err, ErrNotFound)
		target, err := repo.RandomFollowTarget(ctx, alice, true)
		require.NoError(t, err)
		assert.Equal(t, bob, target)

		_, err = pool.Exec(ctx, `INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)`, bob, alice)
		require.NoError(t, err)

		// Now Bob follows Alice, so Alice has someone to follow back...
		back, err := repo.RandomFollowBackTarget(ctx, alice, true)
		require.NoError(t, err)
		assert.Equal(t, bob, back)
		// ...and Bob's unreciprocated follow is the one offered for dropping.
		drop, err := repo.RandomFollowedUser(ctx, bob, true)
		require.NoError(t, err)
		assert.Equal(t, alice, drop)
		// Alice follows nobody, so she has nothing to unfollow.
		_, err = repo.RandomFollowedUser(ctx, alice, true)
		assert.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("comment targets for replies and likes", func(t *testing.T) {
		var commentID string
		require.NoError(t, pool.QueryRow(ctx, `
			INSERT INTO comments (user_id, target_id, target_type, body)
			VALUES ($1, $2, 'score_card', 'nice one') RETURNING id::text
		`, alice, cardID).Scan(&commentID))

		// Bob can reply into Alice's thread, and is told who he is replying to.
		id, author, err := repo.RandomTopLevelComment(ctx, cardID, "score_card", bob, true)
		require.NoError(t, err)
		assert.Equal(t, commentID, id)
		assert.Equal(t, "Sim Alice", author)

		// Nobody replies to themselves, or likes their own comment.
		_, _, err = repo.RandomTopLevelComment(ctx, cardID, "score_card", alice, true)
		assert.ErrorIs(t, err, ErrNotFound)
		_, err = repo.RandomLikeableComment(ctx, alice, true)
		assert.ErrorIs(t, err, ErrNotFound)

		likeable, err := repo.RandomLikeableComment(ctx, bob, true)
		require.NoError(t, err)
		assert.Equal(t, commentID, likeable)

		// A real user commenting on a simulated card must not become a reply
		// target while interact_with_real_users is off. The card being
		// simulated says nothing about who commented on it.
		real := simTestActor(t, pool)
		_, err = pool.Exec(ctx, `
			INSERT INTO comments (user_id, target_id, target_type, body)
			VALUES ($1, $2, 'score_card', 'real person here')
		`, real, cardID)
		require.NoError(t, err)

		for i := 0; i < 20; i++ {
			id, _, err := repo.RandomTopLevelComment(ctx, cardID, "score_card", bob, true)
			require.NoError(t, err)
			assert.Equal(t, commentID, id, "picked a real user's comment to reply to")
		}
		// With the restriction lifted, the real user's comment is fair game.
		sawReal := false
		for i := 0; i < 40; i++ {
			id, _, err := repo.RandomTopLevelComment(ctx, cardID, "score_card", bob, false)
			require.NoError(t, err)
			if id != commentID {
				sawReal = true
			}
		}
		assert.True(t, sawReal, "with real-user interaction on, real comments should be reachable")
	})

	t.Run("empty surfaces report not found rather than erroring", func(t *testing.T) {
		_, err := repo.RandomPublicPost(ctx, alice, true, false)
		assert.ErrorIs(t, err, ErrNotFound)
		_, err = repo.RandomActivity(ctx, alice, true, false)
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

// insertSimTestCard adds a public, non-draft score card owned by ownerID.
func insertSimTestCard(t *testing.T, pool *pgxpool.Pool, ownerID string, total, xCount int16) string {
	t.Helper()
	var id string
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO score_cards (user_id, shot_at, shot_scores, shot_xs, total_score, x_count, visibility, is_draft)
		VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, 'public', FALSE)
		RETURNING id::text
	`, ownerID, make([]int16, 25), make([]bool, 25), total, xCount).Scan(&id))
	return id
}
