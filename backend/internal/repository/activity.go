package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ActivityRepository struct {
	db *pgxpool.Pool
}

func NewActivityRepository(db *pgxpool.Pool) *ActivityRepository {
	return &ActivityRepository{db: db}
}

// Ingest writes a single activity event. Fire-and-forget — callers should handle or
// log errors rather than surfacing them to users.
func (r *ActivityRepository) Ingest(ctx context.Context, userID string, actType model.ActivityType, targetID, targetType *string, metadata []byte, leagueID, clubID *string, visibility string) error {
	if visibility == "" {
		visibility = "public"
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO activities (user_id, type, target_id, target_type, metadata, league_id, club_id, visibility)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		userID, actType, targetID, targetType, metadata, leagueID, clubID, visibility,
	)
	if err != nil {
		return fmt.Errorf("ingest activity: %w", err)
	}
	return nil
}

// activityColumns is the shared SELECT list for all feed queries.
const activityColumns = `a.id, a.user_id, u.display_name, u.avatar_url,
       a.type, a.target_id::text, a.target_type, a.metadata,
       a.league_id, a.club_id, a.visibility, a.created_at`

// scanActivity scans a single activity row matching activityColumns order.
func scanActivity(scan func(dest ...any) error) (*model.Activity, error) {
	var a model.Activity
	if err := scan(
		&a.ID, &a.UserID, &a.DisplayName, &a.AvatarURL,
		&a.Type, &a.TargetID, &a.TargetType, &a.Metadata,
		&a.LeagueID, &a.ClubID, &a.Visibility, &a.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &a, nil
}

// GetFeedFiltered returns a paginated activity feed based on the requested filter.
func (r *ActivityRepository) GetFeedFiltered(ctx context.Context, req model.FeedRequest) ([]*model.Activity, error) {
	var (
		rows pgxRows
		err  error
	)

	switch req.Filter {
	case model.FeedPublic:
		rows, err = r.db.Query(ctx, `
			SELECT `+activityColumns+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			WHERE a.visibility = 'public'
			  AND u.feed_opt_out = FALSE
			  AND u.profile_visibility <> 'private'
			  AND a.user_id NOT IN (
			      SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
			      UNION
			      SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
			  )
			  AND ($3 = '' OR a.created_at < $3::timestamptz)
			ORDER BY a.created_at DESC
			LIMIT $2
		`, req.ViewerID, req.Limit, req.Cursor)

	case model.FeedLeague:
		rows, err = r.db.Query(ctx, `
			SELECT `+activityColumns+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			WHERE a.league_id = $1
			  AND a.user_id NOT IN (
			      SELECT blocker_id FROM user_blocks WHERE blocked_id = $2
			      UNION
			      SELECT blocked_id FROM user_blocks WHERE blocker_id = $2
			  )
			  AND ($4 = '' OR a.created_at < $4::timestamptz)
			ORDER BY a.created_at DESC
			LIMIT $3
		`, req.LeagueID, req.ViewerID, req.Limit, req.Cursor)

	case model.FeedClub:
		rows, err = r.db.Query(ctx, `
			SELECT `+activityColumns+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			WHERE a.club_id = $1
			  AND a.user_id NOT IN (
			      SELECT blocker_id FROM user_blocks WHERE blocked_id = $2
			      UNION
			      SELECT blocked_id FROM user_blocks WHERE blocker_id = $2
			  )
			  AND ($4 = '' OR a.created_at < $4::timestamptz)
			ORDER BY a.created_at DESC
			LIMIT $3
		`, req.ClubID, req.ViewerID, req.Limit, req.Cursor)

	default: // for_you
		rows, err = r.db.Query(ctx, `
			SELECT `+activityColumns+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			WHERE a.user_id IN (
				SELECT following_id FROM user_follows WHERE follower_id = $1
				UNION ALL SELECT $1
			)
			AND a.user_id NOT IN (
				SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
				UNION
				SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
			)
			AND (u.feed_opt_out = FALSE OR a.user_id = $1)
			AND (a.visibility IN ('public', 'followers') OR a.user_id = $1)
			AND ($3 = '' OR a.created_at < $3::timestamptz)
			ORDER BY a.created_at DESC
			LIMIT $2
		`, req.ViewerID, req.Limit, req.Cursor)
	}

	if err != nil {
		return nil, fmt.Errorf("get feed (%s): %w", req.Filter, err)
	}
	defer rows.Close()

	var items []*model.Activity
	for rows.Next() {
		a, scanErr := scanActivity(rows.Scan)
		if scanErr != nil {
			return nil, fmt.Errorf("scan activity: %w", scanErr)
		}
		items = append(items, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("feed rows: %w", err)
	}
	if items == nil {
		items = []*model.Activity{}
	}
	return items, nil
}

// GetFeed returns a paginated "For You" feed (backwards-compatible wrapper).
func (r *ActivityRepository) GetFeed(ctx context.Context, viewerID string, limit int, cursor string) ([]*model.Activity, error) {
	return r.GetFeedFiltered(ctx, model.FeedRequest{
		ViewerID: viewerID,
		Filter:   model.FeedForYou,
		Limit:    limit,
		Cursor:   cursor,
	})
}

// pgxRows is satisfied by pgx query result types.
type pgxRows interface {
	Close()
	Next() bool
	Scan(dest ...any) error
	Err() error
}
