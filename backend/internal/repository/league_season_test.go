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

// Season and round maintenance against a live PostgreSQL instance: the
// "empty string clears" patches are expressed in SQL, and which round new
// cards land in is decided by a query, so neither can be checked without a
// database. Skipped unless DB_HOST is set — CI's backend job provides one.

// newTestSeasonLeague provisions an empty league owned by a fresh user and
// returns the repository, the league id and the owner id.
func newTestSeasonLeague(t *testing.T) (*LeagueRepository, *pgxpool.Pool, string, string) {
	t.Helper()
	pool := testPool(t)
	repo := NewLeagueRepository(pool)
	ctx := context.Background()

	ownerID := newTestUser(t, pool, "owner", testName(t, "owner"))

	var leagueID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO leagues (name, created_by) VALUES ($1, $2) RETURNING id`,
		fmt.Sprintf("Seasontest %s", t.Name()), ownerID).Scan(&leagueID))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM share_slug_aliases WHERE entity_id = $1`, leagueID)
		_, _ = pool.Exec(ctx, `DELETE FROM leagues WHERE id = $1`, leagueID)
	})
	return repo, pool, leagueID, ownerID
}

func TestUpdateSeason_PatchesAndClears(t *testing.T) {
	repo, _, leagueID, _ := newTestSeasonLeague(t)
	ctx := context.Background()

	season, err := repo.CreateSeason(ctx, leagueID, &model.CreateSeasonInput{
		Name: "Season One", StartsOn: "2026-05-01", EndsOn: strPtr("2026-05-31"),
	})
	require.NoError(t, err)

	// An omitted field is kept, not blanked.
	updated, err := repo.UpdateSeason(ctx, season.ID, &model.UpdateSeasonInput{Name: strPtr("Spring 2026")})
	require.NoError(t, err)
	assert.Equal(t, "Spring 2026", updated.Name)
	assert.Equal(t, "2026-05-01", updated.StartsOn)
	require.NotNil(t, updated.EndsOn)
	assert.Equal(t, "2026-05-31", *updated.EndsOn)
	assert.True(t, updated.IsActive)

	// An empty string clears — this is how an open-ended season is restored.
	updated, err = repo.UpdateSeason(ctx, season.ID, &model.UpdateSeasonInput{EndsOn: strPtr("")})
	require.NoError(t, err)
	assert.Nil(t, updated.EndsOn)

	// Archiving is a patch like any other and leaves the dates alone.
	isActive := false
	updated, err = repo.UpdateSeason(ctx, season.ID, &model.UpdateSeasonInput{IsActive: &isActive})
	require.NoError(t, err)
	assert.False(t, updated.IsActive)
	assert.Equal(t, "2026-05-01", updated.StartsOn)

	_, err = repo.UpdateSeason(ctx, "00000000-0000-0000-0000-000000000000", &model.UpdateSeasonInput{})
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestUpdateRound_ClearsWindow(t *testing.T) {
	repo, _, leagueID, _ := newTestSeasonLeague(t)
	ctx := context.Background()

	season, err := repo.CreateSeason(ctx, leagueID, &model.CreateSeasonInput{Name: "S", StartsOn: "2026-05-01"})
	require.NoError(t, err)
	round, err := repo.CreateRound(ctx, season.ID, &model.CreateRoundInput{
		Name: "Week 1", OpensAt: strPtr("2026-05-01T09:00:00Z"), ClosesAt: strPtr("2026-05-07T21:00:00Z"),
	})
	require.NoError(t, err)

	// Moving one end of the window leaves the other where it was.
	updated, err := repo.UpdateRound(ctx, round.ID, &model.UpdateRoundInput{ClosesAt: strPtr("2026-05-08T21:00:00Z")})
	require.NoError(t, err)
	require.NotNil(t, updated.OpensAt)
	require.NotNil(t, updated.ClosesAt)
	assert.Contains(t, *updated.ClosesAt, "2026-05-08")

	// Clearing both dates is how a round is made permanently open again.
	updated, err = repo.UpdateRound(ctx, round.ID, &model.UpdateRoundInput{
		Name: strPtr("Submissions"), OpensAt: strPtr(""), ClosesAt: strPtr(""),
	})
	require.NoError(t, err)
	assert.Equal(t, "Submissions", updated.Name)
	assert.Nil(t, updated.OpensAt)
	assert.Nil(t, updated.ClosesAt)
}

// Archiving a season has to take its rounds out of the running for new cards,
// or the switch means nothing: the season would keep collecting submissions
// after the admin retired it.
func TestGetOrCreateDefaultRound_SkipsArchivedSeasons(t *testing.T) {
	repo, _, leagueID, _ := newTestSeasonLeague(t)
	ctx := context.Background()

	season, err := repo.CreateSeason(ctx, leagueID, &model.CreateSeasonInput{Name: "Season One", StartsOn: "2026-05-01"})
	require.NoError(t, err)
	round, err := repo.CreateRound(ctx, season.ID, &model.CreateRoundInput{Name: "Week 1"})
	require.NoError(t, err)

	active, err := repo.GetOrCreateDefaultRound(ctx, leagueID)
	require.NoError(t, err)
	assert.Equal(t, round.ID, active.ID)

	isActive := false
	_, err = repo.UpdateSeason(ctx, season.ID, &model.UpdateSeasonInput{IsActive: &isActive})
	require.NoError(t, err)

	// With every season archived the league is bootstrapped afresh, exactly as
	// a brand-new one is — never back into the retired season.
	active, err = repo.GetOrCreateDefaultRound(ctx, leagueID)
	require.NoError(t, err)
	assert.NotEqual(t, round.ID, active.ID)
	assert.Equal(t, "General", active.SeasonName)
}

// score_cards.league_round_id is ON DELETE SET NULL, so a delete that went
// through would strip the cards out of the league instead of failing. The
// counts are what the service refuses on.
func TestCountCards_TracksSubmissions(t *testing.T) {
	repo, pool, leagueID, ownerID := newTestSeasonLeague(t)
	ctx := context.Background()

	season, err := repo.CreateSeason(ctx, leagueID, &model.CreateSeasonInput{Name: "S", StartsOn: "2026-05-01"})
	require.NoError(t, err)
	round, err := repo.CreateRound(ctx, season.ID, &model.CreateRoundInput{Name: "Week 1"})
	require.NoError(t, err)

	n, err := repo.CountRoundCards(ctx, round.ID)
	require.NoError(t, err)
	assert.Zero(t, n)

	cardID := insertSimTestCard(t, pool, ownerID, 240, 5)
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM score_cards WHERE id = $1`, cardID) })
	_, err = pool.Exec(ctx, `UPDATE score_cards SET league_round_id = $1 WHERE id = $2`, round.ID, cardID)
	require.NoError(t, err)

	n, err = repo.CountRoundCards(ctx, round.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, n)

	n, err = repo.CountSeasonCards(ctx, season.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, n, "a season's count spans every round in it")

	// An unused round is deletable; ownership is scoped to the league.
	spare, err := repo.CreateRound(ctx, season.ID, &model.CreateRoundInput{Name: "Week 2"})
	require.NoError(t, err)
	belongs, err := repo.RoundBelongsToLeague(ctx, spare.ID, leagueID)
	require.NoError(t, err)
	assert.True(t, belongs)
	require.NoError(t, repo.DeleteRound(ctx, spare.ID))
	assert.ErrorIs(t, repo.DeleteRound(ctx, spare.ID), ErrNotFound)
}
