package repository

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Database-backed sitemap tests. The interesting behaviour is in the SQL —
// which rows are eligible, and whether the COUNT queries agree with the LIST
// queries — so it can only be checked against Postgres. Skipped unless
// DB_HOST is set; CI's backend job provides one.

// newSitemapUser inserts a user with explicit visibility and simulation
// flags and returns its id.
func newSitemapUser(t *testing.T, pool *pgxpool.Pool, key, visibility string, simulated bool) string {
	t.Helper()
	var id string
	email := fmt.Sprintf("sitemap-%s-%s@example.test", t.Name(), key)
	err := pool.QueryRow(context.Background(),
		`INSERT INTO users (email, display_name, password_hash, slug, profile_visibility, is_simulated)
		 VALUES ($1, $2, 'x', $3, $4, $5) RETURNING id`,
		email, "Sitemap "+key, "sitemap-"+key, visibility, simulated).Scan(&id)
	require.NoError(t, err)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM share_slug_aliases WHERE entity_id = $1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

// TestListPublicUserIDs_ExcludesSimulatedAndPrivate covers who is eligible for
// the sitemap. Simulated personas are generated content — submitting them for
// indexing is what Google's spam policies mean by auto-generated pages — and
// private profiles must never be advertised at all.
func TestListPublicUserIDs_ExcludesSimulatedAndPrivate(t *testing.T) {
	pool := testPool(t)
	repo := NewSitemapRepository(pool)

	publicID := newSitemapUser(t, pool, "public", "public", false)
	simulatedID := newSitemapUser(t, pool, "simulated", "public", true)
	privateID := newSitemapUser(t, pool, "private", "private", false)

	entries, err := repo.ListPublicUserIDs(context.Background())
	require.NoError(t, err)

	got := map[string]SitemapEntry{}
	for _, e := range entries {
		got[e.ID] = e
	}

	assert.Contains(t, got, publicID, "a public profile belongs in the sitemap")
	assert.NotContains(t, got, simulatedID, "simulated personas must not be submitted for indexing")
	assert.NotContains(t, got, privateID, "private profiles must never be advertised")

	assert.Equal(t, "sitemap-public", got[publicID].Slug,
		"the slug drives the share URL; without it the sitemap falls back to the UUID")
	assert.NotEmpty(t, got[publicID].UpdatedAt, "lastmod must be populated")
}

// TestCountPublicUsers_AgreesWithList is the guard for the admin Sitemap & SEO
// page. Its "Public Users" and "Total URLs" tiles come from the COUNT queries
// while the crawler gets the LIST queries; if the two drift, the admin page
// confidently reports a sitemap that was never served.
func TestCountPublicUsers_AgreesWithList(t *testing.T) {
	pool := testPool(t)
	repo := NewSitemapRepository(pool)
	ctx := context.Background()

	newSitemapUser(t, pool, "counted", "public", false)
	newSitemapUser(t, pool, "uncounted", "public", true)
	newSitemapUser(t, pool, "hidden", "private", false)

	entries, err := repo.ListPublicUserIDs(ctx)
	require.NoError(t, err)
	count, err := repo.CountPublicUsers(ctx)
	require.NoError(t, err)

	assert.Equal(t, len(entries), count,
		"admin sitemap stats must count exactly the users the sitemap lists")
}

// TestCountPublicLeaguesAndClubs_AgreeWithLists extends the same invariant to
// the other two tiles on the admin page.
func TestCountPublicLeaguesAndClubs_AgreeWithLists(t *testing.T) {
	pool := testPool(t)
	repo := NewSitemapRepository(pool)
	ctx := context.Background()

	leagues, err := repo.ListPublicLeagueIDs(ctx)
	require.NoError(t, err)
	leagueCount, err := repo.CountPublicLeagues(ctx)
	require.NoError(t, err)
	assert.Equal(t, len(leagues), leagueCount,
		"admin league tile must match the leagues the sitemap lists")

	clubs, err := repo.ListPublicClubIDs(ctx)
	require.NoError(t, err)
	clubCount, err := repo.CountPublicClubs(ctx)
	require.NoError(t, err)
	assert.Equal(t, len(clubs), clubCount,
		"admin club tile must match the clubs the sitemap lists")
}
