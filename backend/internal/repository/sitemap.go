package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// SitemapRepository provides data needed to build a dynamic sitemap and to
// record admin-initiated search-engine ping submissions.
type SitemapRepository struct {
	db *pgxpool.Pool
}

func NewSitemapRepository(db *pgxpool.Pool) *SitemapRepository {
	return &SitemapRepository{db: db}
}

// SitemapEntry is a lightweight struct for sitemap URL generation (id + updated_at).
type SitemapEntry struct {
	ID        string
	UpdatedAt string // RFC 3339 date or date-time
}

// ListPublicUserIDs returns IDs and updated_at for users with public profiles.
func (r *SitemapRepository) ListPublicUserIDs(ctx context.Context) ([]SitemapEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, updated_at::date::text
		FROM users
		WHERE profile_visibility = 'public'
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("sitemap list public users: %w", err)
	}
	defer rows.Close()

	var entries []SitemapEntry
	for rows.Next() {
		var e SitemapEntry
		if err := rows.Scan(&e.ID, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("sitemap scan user: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ListPublicLeagueIDs returns IDs and created_at for public leagues (not club-scoped).
func (r *SitemapRepository) ListPublicLeagueIDs(ctx context.Context) ([]SitemapEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, created_at::date::text
		FROM leagues
		WHERE type = 'public' AND club_id IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("sitemap list public leagues: %w", err)
	}
	defer rows.Close()

	var entries []SitemapEntry
	for rows.Next() {
		var e SitemapEntry
		if err := rows.Scan(&e.ID, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("sitemap scan league: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ListPublicClubIDs returns IDs and created_at for public clubs.
func (r *SitemapRepository) ListPublicClubIDs(ctx context.Context) ([]SitemapEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, created_at::date::text
		FROM clubs
		WHERE type = 'public'
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("sitemap list public clubs: %w", err)
	}
	defer rows.Close()

	var entries []SitemapEntry
	for rows.Next() {
		var e SitemapEntry
		if err := rows.Scan(&e.ID, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("sitemap scan club: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// CountPublicUsers returns the number of public-profile users.
func (r *SitemapRepository) CountPublicUsers(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE profile_visibility = 'public'`).Scan(&n)
	return n, err
}

// CountPublicLeagues returns the number of public standalone leagues.
func (r *SitemapRepository) CountPublicLeagues(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM leagues WHERE type = 'public' AND club_id IS NULL`).Scan(&n)
	return n, err
}

// CountPublicClubs returns the number of public clubs.
func (r *SitemapRepository) CountPublicClubs(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM clubs WHERE type = 'public'`).Scan(&n)
	return n, err
}

// InsertSubmission records a sitemap ping attempt.
func (r *SitemapRepository) InsertSubmission(ctx context.Context, engine, url, submittedBy string, statusCode *int16, responseBody, errMsg *string) (*model.SitemapSubmission, error) {
	var s model.SitemapSubmission
	err := r.db.QueryRow(ctx, `
		INSERT INTO sitemap_submissions (engine, url, status_code, response_body, error, submitted_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, engine, url, status_code, response_body, error, submitted_by, created_at
	`, engine, url, statusCode, responseBody, errMsg, submittedBy).Scan(
		&s.ID, &s.Engine, &s.URL, &s.StatusCode, &s.ResponseBody, &s.Error, &s.SubmittedBy, &s.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert sitemap submission: %w", err)
	}
	return &s, nil
}

// ListSubmissions returns the most recent sitemap ping records.
func (r *SitemapRepository) ListSubmissions(ctx context.Context, limit, offset int) ([]*model.SitemapSubmission, int, error) {
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM sitemap_submissions`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count sitemap submissions: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, engine, url, status_code, response_body, error, submitted_by, created_at
		FROM sitemap_submissions
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list sitemap submissions: %w", err)
	}
	defer rows.Close()

	var subs []*model.SitemapSubmission
	for rows.Next() {
		var s model.SitemapSubmission
		if err := rows.Scan(&s.ID, &s.Engine, &s.URL, &s.StatusCode, &s.ResponseBody, &s.Error, &s.SubmittedBy, &s.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan sitemap submission: %w", err)
		}
		subs = append(subs, &s)
	}
	return subs, total, rows.Err()
}
