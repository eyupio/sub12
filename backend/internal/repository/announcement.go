package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type AnnouncementRepository struct {
	db *pgxpool.Pool
}

func NewAnnouncementRepository(db *pgxpool.Pool) *AnnouncementRepository {
	return &AnnouncementRepository{db: db}
}

// announcementSelect is shared by the single-row and listing reads so both
// render the author and the scope's name rather than raw ids.
const announcementSelect = `
	SELECT a.id, a.scope, a.league_id, a.club_id, a.event_id,
	       COALESCE(l.name, c.name, e.name, '') AS scope_name,
	       COALESCE(e.slug, '') AS event_slug,
	       a.created_by, u.display_name, u.avatar_url,
	       a.title, a.body, a.recipient_count, a.email_sent, a.created_at
	FROM announcements a
	JOIN users u ON u.id = a.created_by
	LEFT JOIN leagues l ON l.id = a.league_id
	LEFT JOIN clubs c   ON c.id = a.club_id
	LEFT JOIN events e  ON e.id = a.event_id
`

func scanAnnouncement(row pgx.Row) (*model.Announcement, error) {
	a := &model.Announcement{}
	err := row.Scan(
		&a.ID, &a.Scope, &a.LeagueID, &a.ClubID, &a.EventID,
		&a.ScopeName, &a.EventSlug,
		&a.CreatedBy, &a.AuthorName, &a.AuthorAvatarURL,
		&a.Title, &a.Body, &a.RecipientCount, &a.EmailSent, &a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// Create persists the announcement and fills in its id and created_at.
func (r *AnnouncementRepository) Create(ctx context.Context, a *model.Announcement) error {
	err := r.db.QueryRow(ctx, `
		INSERT INTO announcements
			(scope, league_id, club_id, event_id, created_by, title, body, recipient_count, email_sent)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at
	`, a.Scope, a.LeagueID, a.ClubID, a.EventID, a.CreatedBy, a.Title, a.Body, a.RecipientCount, a.EmailSent).
		Scan(&a.ID, &a.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert announcement: %w", err)
	}
	return nil
}

// GetByID returns one announcement with its author and scope name.
func (r *AnnouncementRepository) GetByID(ctx context.Context, id string) (*model.Announcement, error) {
	a, err := scanAnnouncement(r.db.QueryRow(ctx, announcementSelect+` WHERE a.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get announcement: %w", err)
	}
	return a, nil
}

// ListForScope returns a scope's announcements, newest first. scopeID is
// ignored for the platform scope, which has no owning entity.
func (r *AnnouncementRepository) ListForScope(ctx context.Context, scope, scopeID string, limit int) ([]*model.Announcement, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var where string
	args := []any{}
	switch scope {
	case model.AnnouncementScopePlatform:
		where = `WHERE a.scope = 'platform'`
	case model.AnnouncementScopeLeague:
		where = `WHERE a.league_id = $1`
		args = append(args, scopeID)
	case model.AnnouncementScopeClub:
		where = `WHERE a.club_id = $1`
		args = append(args, scopeID)
	case model.AnnouncementScopeEvent:
		where = `WHERE a.event_id = $1`
		args = append(args, scopeID)
	default:
		return nil, fmt.Errorf("unknown announcement scope %q", scope)
	}
	args = append(args, limit)
	query := fmt.Sprintf("%s %s ORDER BY a.created_at DESC LIMIT $%d", announcementSelect, where, len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list announcements: %w", err)
	}
	defer rows.Close()

	items := []*model.Announcement{}
	for rows.Next() {
		a, err := scanAnnouncement(rows)
		if err != nil {
			return nil, fmt.Errorf("scan announcement: %w", err)
		}
		items = append(items, a)
	}
	return items, rows.Err()
}
