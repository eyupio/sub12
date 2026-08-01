package repository

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// The gated Create and Graduate queries take an advisory lock keyed on
// (round, user), and hashtext only accepts text. Casting those placeholders
// straight to text pins them to text for the whole statement, so the uuid
// comparisons in the same query fail with "operator does not exist: uuid =
// text" — every capped league submission 500s. These exercise the real
// queries against Postgres, which is the only place that type resolution
// happens; a mocked repository can't see it. Skipped unless a database is
// configured — CI's backend job provides one.

// newTestLeagueRound provisions a league, season and round with the given
// per-round submission cap, returning the round id.
func newTestLeagueRound(t *testing.T, pool *pgxpool.Pool, ownerID string, maxSubmissions int) string {
	t.Helper()
	ctx := context.Background()

	var leagueID, seasonID, roundID string
	name := fmt.Sprintf("Cardtest %s", t.Name())
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO leagues (name, created_by) VALUES ($1, $2) RETURNING id`,
		name, ownerID).Scan(&leagueID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO seasons (league_id, name, starts_on) VALUES ($1, 'S1', CURRENT_DATE) RETURNING id`,
		leagueID).Scan(&seasonID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO rounds (season_id, name) VALUES ($1, 'R1') RETURNING id`,
		seasonID).Scan(&roundID))
	_, err := pool.Exec(ctx,
		`INSERT INTO league_configs (league_id, max_submissions_per_round) VALUES ($1, $2)
		 ON CONFLICT (league_id) DO UPDATE SET max_submissions_per_round = EXCLUDED.max_submissions_per_round`,
		leagueID, maxSubmissions)
	require.NoError(t, err)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM score_cards WHERE league_round_id = $1`, roundID)
		_, _ = pool.Exec(ctx, `DELETE FROM share_slug_aliases WHERE entity_id = $1`, leagueID)
		_, _ = pool.Exec(ctx, `DELETE FROM leagues WHERE id = $1`, leagueID)
	})
	return roundID
}

func fullGrid() ([]int16, []bool) {
	scores := make([]int16, 25)
	xs := make([]bool, 25)
	for i := range scores {
		scores[i] = 9
	}
	return scores, xs
}

// A capped league round is the default configuration, so this is the ordinary
// "submit a score to my league" path, not an edge case.
func TestCreate_GatedByLeagueSubmissionCap(t *testing.T) {
	pool := testPool(t)
	repo := NewScoreCardRepository(pool)
	ctx := context.Background()

	userID := newTestUser(t, pool, "create-gated", testName(t, "shooter"))
	roundID := newTestLeagueRound(t, pool, userID, 1)
	scores, xs := fullGrid()

	card, err := repo.Create(ctx, userID, &model.CreateScoreCardInput{
		ShotAt:        "2026-08-01",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	}, 225, 0, 1)
	require.NoError(t, err)
	require.NotNil(t, card.LeagueRoundID)
	assert.Equal(t, roundID, *card.LeagueRoundID)
	assert.False(t, card.IsDraft)

	// The lock and count are the point of the gated query: a second card for
	// the same (round, user) must be refused, not silently accepted.
	_, err = repo.Create(ctx, userID, &model.CreateScoreCardInput{
		ShotAt:        "2026-08-02",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	}, 225, 0, 1)
	assert.ErrorIs(t, err, ErrSubmissionLimitExceeded)
}

// The refine flow's final step: a quick-capture draft bound to a capped league
// round is filled in, then graduated.
func TestGraduate_GatedByLeagueSubmissionCap(t *testing.T) {
	pool := testPool(t)
	repo := NewScoreCardRepository(pool)
	ctx := context.Background()

	userID := newTestUser(t, pool, "graduate-gated", testName(t, "shooter"))
	roundID := newTestLeagueRound(t, pool, userID, 1)
	scores, xs := fullGrid()

	draft, err := repo.CreateDraft(ctx, userID, &model.QuickCreateScoreCardInput{
		LeagueRoundID: &roundID,
	})
	require.NoError(t, err)
	require.True(t, draft.IsDraft)

	_, err = repo.Update(ctx, draft.ID, userID, &model.UpdateScoreCardInput{
		ShotAt:     "2026-08-01",
		ShotScores: scores,
		ShotXs:     xs,
	}, 225, 0)
	require.NoError(t, err)

	graduated, err := repo.Graduate(ctx, draft.ID, userID, &roundID, 1)
	require.NoError(t, err)
	assert.False(t, graduated.IsDraft)
	assert.Equal(t, "pending", graduated.Verification)
	require.NotNil(t, graduated.LeagueRoundID)
	assert.Equal(t, roundID, *graduated.LeagueRoundID)

	// A second draft on the same round is over the cap once the first has
	// graduated, and the repository is the atomic authority for that.
	second, err := repo.CreateDraft(ctx, userID, &model.QuickCreateScoreCardInput{
		LeagueRoundID: &roundID,
	})
	require.NoError(t, err)
	_, err = repo.Update(ctx, second.ID, userID, &model.UpdateScoreCardInput{
		ShotAt:     "2026-08-02",
		ShotScores: scores,
		ShotXs:     xs,
	}, 225, 0)
	require.NoError(t, err)

	_, err = repo.Graduate(ctx, second.ID, userID, &roundID, 1)
	assert.ErrorIs(t, err, ErrSubmissionLimitExceeded)
}

// The way out of a full (or closed) round: keep the card as a personal one.
// Detaching happens in the same statement that saves the refinement, so the
// verification reset has to read the new link — reading the row's current one
// would leave a personal card stuck on 'pending' with no league to verify it.
func TestUpdate_DetachesFromLeagueRound(t *testing.T) {
	pool := testPool(t)
	repo := NewScoreCardRepository(pool)
	ctx := context.Background()

	userID := newTestUser(t, pool, "update-detach", testName(t, "shooter"))
	roundID := newTestLeagueRound(t, pool, userID, 1)
	scores, xs := fullGrid()

	card, err := repo.Create(ctx, userID, &model.CreateScoreCardInput{
		ShotAt:        "2026-08-01",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	}, 225, 0, 1)
	require.NoError(t, err)
	require.NotNil(t, card.LeagueRoundID)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM score_cards WHERE id = $1`, card.ID)
	})

	// Omitting league_round_id leaves the card where it is.
	kept, err := repo.Update(ctx, card.ID, userID, &model.UpdateScoreCardInput{
		ShotAt:     "2026-08-01",
		ShotScores: scores,
		ShotXs:     xs,
	}, 225, 0)
	require.NoError(t, err)
	require.NotNil(t, kept.LeagueRoundID)
	assert.Equal(t, roundID, *kept.LeagueRoundID)
	assert.Equal(t, "pending", kept.Verification)

	detach := ""
	detached, err := repo.Update(ctx, card.ID, userID, &model.UpdateScoreCardInput{
		ShotAt:        "2026-08-01",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &detach,
	}, 225, 0)
	require.NoError(t, err)
	assert.Nil(t, detached.LeagueRoundID)
	assert.Equal(t, "verified", detached.Verification)

	// The round is free again, which is the point of detaching rather than
	// leaving an unsubmittable card parked on the cap.
	replacement, err := repo.Create(ctx, userID, &model.CreateScoreCardInput{
		ShotAt:        "2026-08-02",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	}, 225, 0, 1)
	require.NoError(t, err)
	require.NotNil(t, replacement.LeagueRoundID)
}
