package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Entity types stored in share_slug_aliases. Slug uniqueness is scoped per
// type, so a club and a user may both be "malton-rifle-club".
const (
	SlugEntityUser   = "user"
	SlugEntityLeague = "league"
	SlugEntityClub   = "club"
)

// maxSlugBaseLen bounds the name-derived part of a slug. Long enough for a
// full club name, short enough that the URL stays pasteable.
const maxSlugBaseLen = 60

// slugFallback supplies a base when a name slugifies to nothing — a display
// name written entirely in a non-Latin script, for instance.
var slugFallback = map[string]string{
	SlugEntityUser:   "shooter",
	SlugEntityLeague: "league",
	SlugEntityClub:   "club",
}

// slugQuerier is the subset of pgx both *pgxpool.Pool and pgx.Tx satisfy, so a
// slug can be claimed inside an entity's existing creation transaction rather
// than in a second round trip that could leave a row slug-less if it failed.
type slugQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// ShareSlugRepository owns the share_slug_aliases table, which maps every slug
// ever issued to the entity that owns it. Because historical slugs are never
// deleted, a link shared before a rename keeps resolving and a retired slug is
// never reassigned to a different entity.
type ShareSlugRepository struct {
	db *pgxpool.Pool
}

func NewShareSlugRepository(db *pgxpool.Pool) *ShareSlugRepository {
	return &ShareSlugRepository{db: db}
}

// Resolve maps a slug to its entity ID. Returns ErrNotFound for an unknown
// slug so callers can fall through to their usual 404 handling.
func (r *ShareSlugRepository) Resolve(ctx context.Context, entityType, slug string) (string, error) {
	return resolveShareSlug(ctx, r.db, entityType, slug)
}

// Claim reserves a slug for entityID; see claimShareSlug.
func (r *ShareSlugRepository) Claim(ctx context.Context, entityType, entityID, name string) (string, error) {
	return claimShareSlug(ctx, r.db, entityType, entityID, name)
}

// resolveEntityRef maps a public reference to an entity's UUID. A reference is
// either the UUID itself or a share slug, so the same lookup serves the
// crawler hitting /share/users/paul-jennings, the SPA fetching that page, and
// every pre-existing UUID link still circulating.
//
// Unknown slugs come back as ErrNotFound, which callers already translate to a
// 404 — and a non-UUID that reached a UUID column would previously have failed
// as a Postgres cast error anyway.
func resolveEntityRef(ctx context.Context, q slugQuerier, entityType, ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", ErrNotFound
	}
	if _, err := uuid.Parse(ref); err == nil {
		return ref, nil
	}
	return resolveShareSlug(ctx, q, entityType, ref)
}

func resolveShareSlug(ctx context.Context, q slugQuerier, entityType, slug string) (string, error) {
	var id string
	err := q.QueryRow(ctx,
		`SELECT entity_id FROM share_slug_aliases WHERE entity_type = $1 AND slug = $2`,
		entityType, strings.ToLower(strings.TrimSpace(slug)),
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("resolve share slug: %w", err)
	}
	return id, nil
}

// claimShareSlug reserves a slug derived from name for the given entity and
// returns it.
//
// If the entity already owns the slug that name produces, that slug is
// returned untouched — so an update that doesn't change the name is a no-op
// and the canonical URL stays put. Otherwise the first free variant wins,
// disambiguated with a numeric suffix.
//
// The caller is responsible for writing the returned value to the entity's own
// slug column; this only reserves it.
func claimShareSlug(ctx context.Context, r slugQuerier, entityType, entityID, name string) (string, error) {
	base := Slugify(name)
	if base == "" {
		base = slugFallback[entityType]
	}
	if base == "" {
		base = "item"
	}

	// The alias row may already exist and belong to this entity (unchanged
	// name, or a rename back to a previous one) — reuse it rather than
	// minting "paul-2" for someone who is still Paul.
	candidate := base
	for n := 1; n < 1000; n++ {
		if n > 1 {
			candidate = fmt.Sprintf("%s-%d", base, n)
		}
		owner, err := resolveShareSlug(ctx, r, entityType, candidate)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return "", err
		}
		if err == nil {
			if owner == entityID {
				return candidate, nil
			}
			continue // taken by somebody else
		}

		// The alias table says the slug is free; check the entity's own column
		// agrees before handing it out. The two are written together and
		// shouldn't disagree, but if they ever do — a partial restore, manual
		// surgery — trusting the alias alone turns the entity's unique index
		// into a hard failure on create. Skipping the candidate degrades to a
		// numeric suffix instead.
		if holder, err := entityHoldingSlug(ctx, r, entityType, candidate); err == nil {
			if holder != entityID {
				continue
			}
		} else if !errors.Is(err, ErrNotFound) {
			return "", err
		}

		tag, err := r.Exec(ctx,
			`INSERT INTO share_slug_aliases (entity_type, slug, entity_id)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			entityType, candidate, entityID,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				continue // lost a race to a concurrent claim
			}
			return "", fmt.Errorf("claim share slug: %w", err)
		}
		if tag.RowsAffected() == 0 {
			continue // concurrent claim took it between the check and the insert
		}
		return candidate, nil
	}
	return "", fmt.Errorf("claim share slug: exhausted candidates for %q", base)
}

// entityHoldingSlug reports which entity currently has slug written to its own
// table, or ErrNotFound when none does. Used as a cross-check against the
// alias table so the two can't drift into a state that breaks writes.
func entityHoldingSlug(ctx context.Context, q slugQuerier, entityType, slug string) (string, error) {
	var stmt string
	switch entityType {
	case SlugEntityUser:
		stmt = `SELECT id FROM users WHERE slug = $1`
	case SlugEntityLeague:
		stmt = `SELECT id FROM leagues WHERE slug = $1`
	case SlugEntityClub:
		stmt = `SELECT id FROM clubs WHERE slug = $1`
	default:
		return "", fmt.Errorf("entity holding slug: unknown entity type %q", entityType)
	}
	var id string
	err := q.QueryRow(ctx, stmt, slug).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("entity holding slug: %w", err)
	}
	return id, nil
}

// syncShareSlug brings an entity's slug into line with its current name and
// returns the slug now in force. A no-op when the name still produces the slug
// the entity already holds, so an update that leaves the name alone never
// moves the canonical URL.
//
// Call it inside the entity's own transaction where there is one: a row that
// committed without a slug would fall back to its UUID in share URLs, which
// works but is the thing this feature exists to avoid.
func syncShareSlug(ctx context.Context, q slugQuerier, entityType, entityID, name, current string) (string, error) {
	slug, err := claimShareSlug(ctx, q, entityType, entityID, name)
	if err != nil {
		return current, err
	}
	if slug == current {
		return current, nil
	}

	// Switched rather than interpolated: the table name is fixed per entity
	// type and the SQL stays literal.
	var stmt string
	switch entityType {
	case SlugEntityUser:
		stmt = `UPDATE users SET slug = $2 WHERE id = $1`
	case SlugEntityLeague:
		stmt = `UPDATE leagues SET slug = $2 WHERE id = $1`
	case SlugEntityClub:
		stmt = `UPDATE clubs SET slug = $2 WHERE id = $1`
	default:
		return current, fmt.Errorf("sync share slug: unknown entity type %q", entityType)
	}
	if _, err := q.Exec(ctx, stmt, entityID, slug); err != nil {
		return current, fmt.Errorf("sync share slug: %w", err)
	}
	return slug, nil
}

// Slugify reduces a display name to a URL-safe slug: lowercase, ASCII
// alphanumerics, single hyphens between words.
//
// Characters outside [a-z0-9] are treated as separators rather than
// transliterated, so "Malton Rifle Club" becomes "malton-rifle-club" and a
// name with no Latin characters at all reduces to "" — Claim substitutes a
// fallback base in that case. This deliberately matches the regexp the
// backfill migration uses, so a row slugged by the migration and a row slugged
// by the application agree.
func Slugify(name string) string {
	var b strings.Builder
	b.Grow(len(name))
	lastHyphen := true // leading hyphens are suppressed
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			lastHyphen = false
		case !lastHyphen:
			b.WriteByte('-')
			lastHyphen = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > maxSlugBaseLen {
		out = strings.Trim(out[:maxSlugBaseLen], "-")
	}
	return out
}
