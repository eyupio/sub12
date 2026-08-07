package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ActivityRepository struct {
	db *pgxpool.Pool
}

func NewActivityRepository(db *pgxpool.Pool) *ActivityRepository {
	return &ActivityRepository{db: db}
}

// MarkPostEdited updates feed metadata for an existing post_created activity.
// It keeps all existing metadata and only patches body preview + edited timestamp.
func (r *ActivityRepository) MarkPostEdited(ctx context.Context, postID, bodyPreview string, editedAt time.Time) error {
	_, err := r.db.Exec(ctx, `
		UPDATE activities
		SET metadata = jsonb_set(
				jsonb_set(COALESCE(metadata, '{}'::jsonb), '{body_preview}', to_jsonb($1::text), true),
				'{edited_at}',
				to_jsonb($2::text),
				true
			)
		WHERE type = $3
		  AND target_type = 'post'
		  AND target_id = $4::uuid
	`, bodyPreview, editedAt.UTC().Format(time.RFC3339Nano), model.ActivityPostCreated, postID)
	if err != nil {
		return fmt.Errorf("mark post edited activity: %w", err)
	}
	return nil
}

// DeletePostActivities removes feed rows for a deleted post.
func (r *ActivityRepository) DeletePostActivities(ctx context.Context, postID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM activities
		WHERE type = $1
		  AND target_type = 'post'
		  AND target_id = $2::uuid
	`, model.ActivityPostCreated, postID)
	if err != nil {
		return fmt.Errorf("delete post activities: %w", err)
	}
	return nil
}

// DeleteReviewRequestActivities removes the community_review_requested feed
// rows for a card whose review request was cancelled, so the feed doesn't keep
// advertising a confirm CTA that can only 404.
func (r *ActivityRepository) DeleteReviewRequestActivities(ctx context.Context, scoreCardID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM activities
		WHERE type = $1
		  AND target_type = 'score_card'
		  AND target_id = $2::uuid
	`, model.ActivityCommunityReviewRequested, scoreCardID)
	if err != nil {
		return fmt.Errorf("delete review request activities: %w", err)
	}
	return nil
}

// DeleteOwn permanently removes an activity row owned by the given user.
// Returns ErrNotFound if the activity does not exist or belongs to another user.
func (r *ActivityRepository) DeleteOwn(ctx context.Context, activityID, userID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM activities
		WHERE id = $1::uuid
		  AND user_id = $2::uuid
	`, activityID, userID)
	if err != nil {
		return fmt.Errorf("delete own activity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
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
// Like/comment counts are resolved per target_type: denormalized columns for
// score_card and post, subquery counts for activity-level engagement on all others.
const activityColumns = `a.id, a.user_id, u.display_name, u.avatar_url, u.star_level,
       a.type, a.target_id::text, a.target_type, a.metadata,
       a.league_id, a.club_id, a.visibility, a.created_at,
       CASE
           WHEN a.target_type = 'score_card' THEN COALESCE(sc.like_count, 0)
           WHEN a.target_type = 'post'       THEN COALESCE(p.like_count, 0)
           ELSE (SELECT COUNT(*)::int FROM likes WHERE target_id = a.id AND target_type = 'activity')
       END,
       CASE
           WHEN a.target_type = 'score_card' THEN COALESCE(sc.comment_count, 0)
           WHEN a.target_type = 'post'       THEN COALESCE(p.comment_count, 0)
           ELSE (SELECT COUNT(*)::int FROM comments WHERE target_id = a.id AND target_type = 'activity' AND parent_id IS NULL AND hidden_at IS NULL)
       END`

// activityColumnsViewer extends activityColumns with a viewer-specific is_liked flag.
// $viewerParam is the positional parameter placeholder for the viewer UUID (e.g. "$1").
func activityColumnsViewer(viewerParam string) string {
	return activityColumns + `,
       CASE
           WHEN a.target_type = 'score_card' THEN EXISTS(
               SELECT 1 FROM likes WHERE target_id = a.target_id AND target_type = 'score_card' AND user_id = ` + viewerParam + `)
           WHEN a.target_type = 'post' THEN EXISTS(
               SELECT 1 FROM likes WHERE target_id = a.target_id AND target_type = 'post' AND user_id = ` + viewerParam + `)
           ELSE EXISTS(
               SELECT 1 FROM likes WHERE target_id = a.id AND target_type = 'activity' AND user_id = ` + viewerParam + `)
       END`
}

// activityJoins are the LEFT JOINs added to enrich score_card and post targets.
const activityJoins = `LEFT JOIN score_cards sc ON sc.id = a.target_id AND a.target_type = 'score_card'
       LEFT JOIN posts p ON p.id = a.target_id AND a.target_type = 'post'`

// scanActivity scans a single activity row matching activityColumns order (no viewer).
func scanActivity(scan func(dest ...any) error) (*model.Activity, error) {
	var a model.Activity
	if err := scan(
		&a.ID, &a.UserID, &a.DisplayName, &a.AvatarURL, &a.StarLevel,
		&a.Type, &a.TargetID, &a.TargetType, &a.Metadata,
		&a.LeagueID, &a.ClubID, &a.Visibility, &a.CreatedAt,
		&a.LikeCount, &a.CommentCount,
	); err != nil {
		return nil, err
	}
	return &a, nil
}

// scanActivityViewer scans a row matching activityColumnsViewer order.
func scanActivityViewer(scan func(dest ...any) error) (*model.Activity, error) {
	var a model.Activity
	if err := scan(
		&a.ID, &a.UserID, &a.DisplayName, &a.AvatarURL, &a.StarLevel,
		&a.Type, &a.TargetID, &a.TargetType, &a.Metadata,
		&a.LeagueID, &a.ClubID, &a.Visibility, &a.CreatedAt,
		&a.LikeCount, &a.CommentCount, &a.IsLiked,
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

	cols := activityColumnsViewer("$1")
	// simFilter is injected into the public feed when the admin has disabled
	// including simulated content in public surfaces.
	simFilter := ""
	if req.ExcludeSimulated {
		simFilter = " AND NOT u.is_simulated"
	}
	// simFilterForYou keeps the viewer's own activities but drops simulated
	// accounts the viewer follows.
	simFilterForYou := ""
	if req.ExcludeSimulated {
		simFilterForYou = " AND (a.user_id = $1 OR NOT u.is_simulated)"
	}

	// Every branch below excludes activity in both directions of a block
	// (blocker_id = viewer and blocked_id = viewer): a block is symmetric, so
	// neither side should see the other's activity regardless of who blocked
	// whom.
	switch req.Filter {
	case model.FeedPublic:
		rows, err = r.db.Query(ctx, `
			SELECT `+cols+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			`+activityJoins+`
			WHERE a.visibility = 'public'
			  AND a.hidden_at IS NULL
			  AND u.feed_opt_out = FALSE
			  AND u.profile_visibility <> 'private'`+simFilter+`
			  AND (a.target_type <> 'score_card' OR sc.id IS NOT NULL)
			  AND (a.target_type <> 'post' OR p.id IS NOT NULL)
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
			SELECT `+activityColumnsViewer("$2")+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			`+activityJoins+`
			WHERE a.league_id = $1
			  AND a.hidden_at IS NULL
			  AND (a.target_type <> 'score_card' OR sc.id IS NOT NULL)
			  AND (a.target_type <> 'post' OR p.id IS NOT NULL)
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
			SELECT `+activityColumnsViewer("$2")+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			`+activityJoins+`
			WHERE a.club_id = $1
			  AND a.hidden_at IS NULL
			  AND (a.target_type <> 'score_card' OR sc.id IS NOT NULL)
			  AND (a.target_type <> 'post' OR p.id IS NOT NULL)
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
			SELECT `+cols+`
			FROM activities a
			JOIN users u ON u.id = a.user_id
			`+activityJoins+`
			WHERE a.user_id IN (
				SELECT following_id FROM user_follows WHERE follower_id = $1
				UNION ALL SELECT $1
			)
			AND a.hidden_at IS NULL
			AND a.user_id NOT IN (
				SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
				UNION
				SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
			)
			AND (u.feed_opt_out = FALSE OR a.user_id = $1)
			AND (a.visibility IN ('public', 'followers') OR a.user_id = $1)`+simFilterForYou+`
			AND (a.target_type <> 'score_card' OR sc.id IS NOT NULL)
			AND (a.target_type <> 'post' OR p.id IS NOT NULL)
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
		a, scanErr := scanActivityViewer(rows.Scan)
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

// GetByID fetches a single activity by its primary key.
// Returns ErrNotFound if no such row exists.
func (r *ActivityRepository) GetByID(ctx context.Context, id string) (*model.Activity, error) {
	row := r.db.QueryRow(ctx, `
		SELECT `+activityColumns+`
		FROM activities a
		JOIN users u ON u.id = a.user_id
		`+activityJoins+`
		WHERE a.id = $1
	`, id)
	a, err := scanActivity(row.Scan)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get activity by id: %w", err)
	}
	return a, nil
}

// AdminHide marks an activity hidden so feed queries skip it. Idempotent.
func (r *ActivityRepository) AdminHide(ctx context.Context, activityID, adminID, reason string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE activities
		SET hidden_at = NOW(), hidden_by = $2, hide_reason = $3
		WHERE id = $1
	`, activityID, adminID, reason)
	if err != nil {
		return fmt.Errorf("admin hide activity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AdminUnhide clears the hidden state on an activity. Idempotent.
func (r *ActivityRepository) AdminUnhide(ctx context.Context, activityID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE activities
		SET hidden_at = NULL, hidden_by = NULL, hide_reason = NULL
		WHERE id = $1
	`, activityID)
	if err != nil {
		return fmt.Errorf("admin unhide activity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// pgxRows is satisfied by pgx query result types.
type pgxRows interface {
	Close()
	Next() bool
	Scan(dest ...any) error
	Err() error
}
