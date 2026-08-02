package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// GalleryRepository reads a user's uploaded images across the tables that own
// them. Image association is inverted in this schema — each owning table
// stores a /api/v1/images/{id} URL (or, for pellet tests, a real FK) — so the
// gallery is a per-kind read rather than a single images query.
type GalleryRepository struct {
	db *pgxpool.Pool
}

func NewGalleryRepository(db *pgxpool.Pool) *GalleryRepository {
	return &GalleryRepository{db: db}
}

// ListScoreCards returns the user's score cards that carry an uploaded card
// image, with their submission context (league + round, club, event) resolved
// to names so the gallery never renders a raw ID.
func (r *GalleryRepository) ListScoreCards(ctx context.Context, userID string) ([]*model.GalleryItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			sc.id, sc.card_image_url, sc.card_image_rotation,
			sc.shot_at::text, sc.total_score, sc.x_count, sc.is_draft, sc.verification::text,
			CASE WHEN ri.id IS NOT NULL THEN ri.make || ' ' || ri.model END,
			CASE WHEN p.id  IS NOT NULL THEN p.brand  || ' ' || p.model  END,
			sc.league_round_id, se.league_id, l.name, rd.name,
			sc.club_id, c.name,
			sc.event_participant_id, ev.slug, ev.name,
			sc.created_at
		FROM score_cards sc
		LEFT JOIN rifles  ri ON ri.id = sc.rifle_id
		LEFT JOIN pellets p  ON p.id  = sc.pellet_id
		LEFT JOIN rounds  rd ON rd.id = sc.league_round_id
		LEFT JOIN seasons se ON se.id = rd.season_id
		LEFT JOIN leagues l  ON l.id  = se.league_id
		LEFT JOIN clubs   c  ON c.id  = sc.club_id
		LEFT JOIN event_participants ep ON ep.id = sc.event_participant_id
		LEFT JOIN events  ev ON ev.id = ep.event_id
		WHERE sc.user_id = $1 AND sc.card_image_url IS NOT NULL AND sc.card_image_url <> ''
		ORDER BY sc.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list gallery score cards: %w", err)
	}
	defer rows.Close()

	var items []*model.GalleryItem
	for rows.Next() {
		it := model.GalleryItem{Kind: model.GalleryKindScoreCard}
		var shotAt string
		var totalScore, xCount int16
		var isDraft bool
		var verification string
		if err := rows.Scan(
			&it.ID, &it.ImageURL, &it.ImageRotation,
			&shotAt, &totalScore, &xCount, &isDraft, &verification,
			&it.RifleName, &it.PelletName,
			&it.LeagueRoundID, &it.LeagueID, &it.LeagueName, &it.RoundName,
			&it.ClubID, &it.ClubName,
			&it.EventParticipantID, &it.EventSlug, &it.EventName,
			&it.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan gallery score card: %w", err)
		}
		it.Title = "Score card"
		it.ShotAt = &shotAt
		it.TotalScore = &totalScore
		it.XCount = &xCount
		it.IsDraft = &isDraft
		it.Verification = &verification
		items = append(items, &it)
	}
	return items, rows.Err()
}

// ListGear returns the user's rifles and pellets that carry an uploaded photo.
func (r *GalleryRepository) ListGear(ctx context.Context, userID string) ([]*model.GalleryItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT 'rifle', id, image_url, make || ' ' || model, created_at
		FROM rifles
		WHERE user_id = $1 AND image_url IS NOT NULL AND image_url <> ''
		UNION ALL
		SELECT 'pellet', id, image_url, brand || ' ' || model, created_at
		FROM pellets
		WHERE user_id = $1 AND image_url IS NOT NULL AND image_url <> ''
		ORDER BY 5 DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list gallery gear: %w", err)
	}
	defer rows.Close()

	var items []*model.GalleryItem
	for rows.Next() {
		var it model.GalleryItem
		if err := rows.Scan(&it.Kind, &it.ID, &it.ImageURL, &it.Title, &it.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan gallery gear: %w", err)
		}
		items = append(items, &it)
	}
	return items, rows.Err()
}

// ListPelletTestImages returns the user's pellet-test photos, titled with the
// rifle + pellet combination under test and carrying the measured group size
// when the photo is attached to a group.
func (r *GalleryRepository) ListPelletTestImages(ctx context.Context, userID string) ([]*model.GalleryItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			pti.id, '/api/v1/images/' || pti.image_id::text, pti.caption,
			ri.make || ' ' || ri.model || ' · ' || p.brand || ' ' || p.model,
			s.id, s.test_date::text, g.group_size_mm, pti.created_at
		FROM pellet_test_images pti
		JOIN pellet_test_sessions s ON s.id = pti.session_id
		JOIN rifles  ri ON ri.id = s.rifle_id
		JOIN pellets p  ON p.id  = s.pellet_id
		LEFT JOIN pellet_test_groups g ON g.id = pti.group_id
		WHERE s.user_id = $1
		ORDER BY pti.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list gallery pellet tests: %w", err)
	}
	defer rows.Close()

	var items []*model.GalleryItem
	for rows.Next() {
		it := model.GalleryItem{Kind: model.GalleryKindPelletTest}
		if err := rows.Scan(
			&it.ID, &it.ImageURL, &it.Caption, &it.Title,
			&it.SessionID, &it.ShotAt, &it.GroupSizeMM, &it.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan gallery pellet test: %w", err)
		}
		items = append(items, &it)
	}
	return items, rows.Err()
}
