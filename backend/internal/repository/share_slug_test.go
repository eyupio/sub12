package repository

import (
	"context"
	"crypto/sha1"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/db"
)

func TestSlugify(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Paul Jennings", "paul-jennings"},
		{"paul   jennings", "paul-jennings"},
		{"  Malton Rifle Club  ", "malton-rifle-club"},
		{"Yorkshire Winter HFT League", "yorkshire-winter-hft-league"},
		{"Paul-2", "paul-2"},
		{"O'Brien & Sons", "o-brien-sons"},
		{"...leading and trailing...", "leading-and-trailing"},
		{"FT/HFT", "ft-hft"},
		{"2026", "2026"},
		// No transliteration: non-ASCII is treated as a separator, matching the
		// regexp the backfill migration uses.
		{"Ünïcødé Nåme", "n-c-d-n-me"},
		// Nothing usable at all — Claim substitutes a per-type fallback.
		{"!!! ???", ""},
		{"", ""},
		{"   ", ""},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, Slugify(c.in), "Slugify(%q)", c.in)
	}
}

func TestSlugify_TruncatesLongNamesOnACleanBoundary(t *testing.T) {
	got := Slugify("A Very Long Club Name That Goes On And On And On Beyond Sixty Characters Easily")
	assert.LessOrEqual(t, len(got), maxSlugBaseLen)
	assert.NotEmpty(t, got)
	// Truncation must not leave a dangling hyphen — that would read as a typo
	// in a shared link and produce a second slug differing only by punctuation.
	assert.NotEqual(t, "-", string(got[len(got)-1]))
}

// ── integration ─────────────────────────────────────────────────────────────
//
// These exercise the real uniqueness and resolution behaviour against
// Postgres, which is where the interesting cases live (concurrent claims,
// alias retention across renames). Skipped unless a database is configured —
// CI's backend job provides one.

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	host := os.Getenv("DB_HOST")
	if host == "" {
		t.Skip("DB_HOST not set; skipping database-backed slug tests")
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), host, port, os.Getenv("DB_NAME"))

	require.NoError(t, db.Migrate("pgx5://"+dsn[len("postgres://"):]), "migrate test database")

	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(context.Background()))
	return pool
}

// newTestUser inserts a user directly, bypassing UserRepository.Create so the
// row arrives without a slug — the state the claim logic is meant to fix. key
// must be unique within the test; the email is derived from it so two users
// with the same display name are still two distinct rows.
func newTestUser(t *testing.T, pool *pgxpool.Pool, key, displayName string) string {
	t.Helper()
	var id string
	email := fmt.Sprintf("slugtest-%s-%s@example.test", t.Name(), key)
	err := pool.QueryRow(context.Background(),
		`INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'x')
		 RETURNING id`, email, displayName).Scan(&id)
	require.NoError(t, err)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM share_slug_aliases WHERE entity_id = $1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

// testName builds a display name unique to the running test, so assertions
// about which slug a name yields don't depend on the database being otherwise
// empty. Kept short deliberately: a base near maxSlugBaseLen would be
// truncated, which is its own behaviour (see the truncation test) and would
// muddy tests that are about collisions.
func testName(t *testing.T, suffix string) string {
	t.Helper()
	sum := sha1.Sum([]byte(t.Name()))
	return fmt.Sprintf("Slugtest %x %s", sum[:4], suffix)
}

func TestClaimShareSlug_DisambiguatesCollidingNames(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	name := testName(t, "Paul")
	base := Slugify(name)

	// An entity whose own name lands exactly on "<base>-2" is the case a
	// row_number() backfill gets wrong: the second "Paul" wants that slug and
	// has to step past it rather than duplicate it.
	takenID := newTestUser(t, pool, "taken", name+" 2")
	firstID := newTestUser(t, pool, "first", name)
	secondID := newTestUser(t, pool, "second", name)

	taken, err := claimShareSlug(ctx, pool, SlugEntityUser, takenID, name+" 2")
	require.NoError(t, err)
	first, err := claimShareSlug(ctx, pool, SlugEntityUser, firstID, name)
	require.NoError(t, err)
	second, err := claimShareSlug(ctx, pool, SlugEntityUser, secondID, name)
	require.NoError(t, err)

	assert.Equal(t, base+"-2", taken)
	assert.Equal(t, base, first)
	assert.Equal(t, base+"-3", second, "must skip the slug the first entity already holds")
	assert.NotEqual(t, taken, second)
	assert.NotEqual(t, first, second)
}

func TestClaimShareSlug_IsIdempotentForTheSameOwner(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	name := testName(t, "Stable")
	id := newTestUser(t, pool, "only", name)

	first, err := claimShareSlug(ctx, pool, SlugEntityUser, id, name)
	require.NoError(t, err)
	again, err := claimShareSlug(ctx, pool, SlugEntityUser, id, name)
	require.NoError(t, err)

	// An update that leaves the name alone must not walk the canonical URL to
	// "<base>-2" every time the profile is saved.
	assert.Equal(t, Slugify(name), first)
	assert.Equal(t, first, again)
}

func TestSyncShareSlug_RenameKeepsOldSlugResolving(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	before := testName(t, "Pual")
	after := testName(t, "Paul")
	id := newTestUser(t, pool, "only", before)

	old, err := syncShareSlug(ctx, pool, SlugEntityUser, id, before, "")
	require.NoError(t, err)
	assert.Equal(t, Slugify(before), old)

	renamed, err := syncShareSlug(ctx, pool, SlugEntityUser, id, after, old)
	require.NoError(t, err)
	assert.Equal(t, Slugify(after), renamed)
	require.NotEqual(t, old, renamed)

	// The canonical column moves to the new slug...
	var stored string
	require.NoError(t, pool.QueryRow(ctx, `SELECT slug FROM users WHERE id = $1`, id).Scan(&stored))
	assert.Equal(t, renamed, stored)

	// ...but a link already shared under the old one keeps resolving, which is
	// the whole reason aliases are retained.
	resolvedOld, err := resolveShareSlug(ctx, pool, SlugEntityUser, old)
	require.NoError(t, err)
	assert.Equal(t, id, resolvedOld)

	resolvedNew, err := resolveShareSlug(ctx, pool, SlugEntityUser, renamed)
	require.NoError(t, err)
	assert.Equal(t, id, resolvedNew)
}

func TestResolveEntityRef_AcceptsBothSpellings(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	name := testName(t, "Ref")
	id := newTestUser(t, pool, "only", name)
	slug, err := syncShareSlug(ctx, pool, SlugEntityUser, id, name, "")
	require.NoError(t, err)

	fromUUID, err := resolveEntityRef(ctx, pool, SlugEntityUser, id)
	require.NoError(t, err)
	assert.Equal(t, id, fromUUID, "a UUID must pass through without a lookup")

	fromSlug, err := resolveEntityRef(ctx, pool, SlugEntityUser, slug)
	require.NoError(t, err)
	assert.Equal(t, id, fromSlug)

	// Case and stray whitespace shouldn't decide whether a pasted link works.
	fromMessy, err := resolveEntityRef(ctx, pool, SlugEntityUser, "  "+strings.ToUpper(slug)+"  ")
	require.NoError(t, err)
	assert.Equal(t, id, fromMessy)

	_, err = resolveEntityRef(ctx, pool, SlugEntityUser, "no-such-slug-anywhere")
	assert.ErrorIs(t, err, ErrNotFound)

	_, err = resolveEntityRef(ctx, pool, SlugEntityUser, "")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestClaimShareSlug_ScopesUniquenessPerEntityType(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	name := testName(t, "Shared")
	id := newTestUser(t, pool, "only", name)

	asUser, err := claimShareSlug(ctx, pool, SlugEntityUser, id, name)
	require.NoError(t, err)
	asClub, err := claimShareSlug(ctx, pool, SlugEntityClub, id, name)
	require.NoError(t, err)

	// Separate namespaces: a club and a user may hold the same slug without
	// either being pushed onto a numeric suffix.
	assert.Equal(t, Slugify(name), asUser)
	assert.Equal(t, Slugify(name), asClub)
}

func TestClaimShareSlug_FallsBackWhenNameYieldsNothing(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	id := newTestUser(t, pool, "only", "!!! ???")

	slug, err := claimShareSlug(ctx, pool, SlugEntityUser, id, "!!! ???")
	require.NoError(t, err)

	// A name with no usable characters still has to produce a working URL.
	assert.NotEmpty(t, slug)
	assert.Contains(t, slug, slugFallback[SlugEntityUser])
	resolved, err := resolveShareSlug(ctx, pool, SlugEntityUser, slug)
	require.NoError(t, err)
	assert.Equal(t, id, resolved)
}

func TestClaimShareSlug_DistinctLongNamesTruncatingToTheSameBaseStayUnique(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	// Two different names whose slugs are identical for the first
	// maxSlugBaseLen characters. Truncation collapses them onto one base, so
	// the suffix is the only thing keeping their URLs apart.
	long := testName(t, strings.Repeat("Long ", 20))
	longer := long + " And Then Some More"
	require.Equal(t, Slugify(long), Slugify(longer), "precondition: both must truncate to the same base")

	firstID := newTestUser(t, pool, "first", long)
	secondID := newTestUser(t, pool, "second", longer)

	first, err := claimShareSlug(ctx, pool, SlugEntityUser, firstID, long)
	require.NoError(t, err)
	second, err := claimShareSlug(ctx, pool, SlugEntityUser, secondID, longer)
	require.NoError(t, err)

	assert.NotEqual(t, first, second)
	for id, slug := range map[string]string{firstID: first, secondID: second} {
		resolved, err := resolveShareSlug(ctx, pool, SlugEntityUser, slug)
		require.NoError(t, err)
		assert.Equal(t, id, resolved)
	}
}
