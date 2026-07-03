package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type PostRepository struct {
	db *pgxpool.Pool
}

func NewPostRepository(db *pgxpool.Pool) *PostRepository {
	return &PostRepository{db: db}
}

// Create inserts a post with its attachments in a single transaction.
func (r *PostRepository) Create(ctx context.Context, userID string, input *model.CreatePostInput) (*model.Post, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	visibility := input.Visibility
	if visibility == "" {
		visibility = model.PostVisibilityInherit
	}
	var post model.Post
	err = tx.QueryRow(ctx, `
		INSERT INTO posts (user_id, body, league_id, club_id, visibility)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, body, league_id, club_id, visibility, like_count, comment_count, created_at, updated_at
	`, userID, input.Body, input.LeagueID, input.ClubID, visibility).Scan(
		&post.ID, &post.UserID, &post.Body, &post.LeagueID, &post.ClubID, &post.Visibility,
		&post.LikeCount, &post.CommentCount, &post.CreatedAt, &post.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert post: %w", err)
	}

	for i, a := range input.Attachments {
		var att model.PostAttachment
		err = tx.QueryRow(ctx, `
			INSERT INTO post_attachments (post_id, type, target_id, image_url, sort_order)
			VALUES ($1, $2::attachment_type, $3, $4, $5)
			RETURNING id, type::text, target_id, image_url, sort_order
		`, post.ID, a.Type, a.TargetID, a.ImageURL, i).Scan(
			&att.ID, &att.Type, &att.TargetID, &att.ImageURL, &att.SortOrder,
		)
		if err != nil {
			return nil, fmt.Errorf("insert attachment: %w", err)
		}
		post.Attachments = append(post.Attachments, att)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	// Fetch user info for the response
	var displayName string
	var avatarURL *string
	if err := r.db.QueryRow(ctx, `SELECT display_name, avatar_url FROM users WHERE id = $1`, userID).Scan(&displayName, &avatarURL); err != nil {
		return nil, fmt.Errorf("fetch post author: %w", err)
	}
	post.DisplayName = displayName
	post.AvatarURL = avatarURL
	if post.Attachments == nil {
		post.Attachments = []model.PostAttachment{}
	}

	return &post, nil
}

// GetByID retrieves a post with user info and attachments.
func (r *PostRepository) GetByID(ctx context.Context, id string, viewerID *string) (*model.Post, error) {
	var post model.Post
	isLikedSubquery := "false"
	args := []any{id}
	if viewerID != nil {
		isLikedSubquery = "EXISTS(SELECT 1 FROM likes WHERE target_id = p.id AND target_type = 'post' AND user_id = $2)"
		args = append(args, *viewerID)
	}

	err := r.db.QueryRow(ctx, fmt.Sprintf(`
		SELECT p.id, p.user_id, u.display_name, u.avatar_url,
		       p.body, p.league_id, p.club_id, p.visibility, p.hidden_at,
		       p.like_count, p.comment_count,
		       %s AS is_liked,
		       (p.flagged_at IS NOT NULL) AS is_flagged, p.flag_reason,
		       p.created_at, p.updated_at
		FROM posts p
		JOIN users u ON u.id = p.user_id
		WHERE p.id = $1
	`, isLikedSubquery), args...).Scan(
		&post.ID, &post.UserID, &post.DisplayName, &post.AvatarURL,
		&post.Body, &post.LeagueID, &post.ClubID, &post.Visibility, &post.HiddenAt,
		&post.LikeCount, &post.CommentCount, &post.IsLiked,
		&post.IsFlagged, &post.FlagReason,
		&post.CreatedAt, &post.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get post: %w", err)
	}

	post.Attachments, err = r.listAttachments(ctx, post.ID)
	if err != nil {
		return nil, err
	}

	return &post, nil
}

// ListByLeague returns posts for a league, newest first.
func (r *PostRepository) ListByLeague(ctx context.Context, leagueID string, limit, offset int) ([]*model.Post, error) {
	return r.list(ctx, "p.league_id = $1", leagueID, limit, offset)
}

// ListByClub returns posts for a club, newest first.
func (r *PostRepository) ListByClub(ctx context.Context, clubID string, limit, offset int) ([]*model.Post, error) {
	return r.list(ctx, "p.club_id = $1", clubID, limit, offset)
}

// ListByUser returns personal posts by a user (no league/club), newest first.
func (r *PostRepository) ListByUser(ctx context.Context, userID string, limit, offset int) ([]*model.Post, error) {
	return r.list(ctx, "p.user_id = $1 AND p.league_id IS NULL AND p.club_id IS NULL", userID, limit, offset)
}

func (r *PostRepository) list(ctx context.Context, where string, arg any, limit, offset int) ([]*model.Post, error) {
	query := fmt.Sprintf(`
		SELECT p.id, p.user_id, u.display_name, u.avatar_url,
		       p.body, p.league_id, p.club_id, p.visibility, p.hidden_at,
		       p.like_count, p.comment_count,
		       (p.flagged_at IS NOT NULL) AS is_flagged, p.flag_reason,
		       p.created_at, p.updated_at
		FROM posts p
		JOIN users u ON u.id = p.user_id
		WHERE %s AND p.hidden_at IS NULL
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3
	`, where)

	rows, err := r.db.Query(ctx, query, arg, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list posts: %w", err)
	}
	defer rows.Close()

	var posts []*model.Post
	for rows.Next() {
		var p model.Post
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.DisplayName, &p.AvatarURL,
			&p.Body, &p.LeagueID, &p.ClubID, &p.Visibility, &p.HiddenAt,
			&p.LikeCount, &p.CommentCount,
			&p.IsFlagged, &p.FlagReason,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, &p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list posts rows: %w", err)
	}

	// Batch-load attachments for all posts in one query instead of one query per
	// post (N+1) — this runs on every feed page render.
	if len(posts) > 0 {
		postIDs := make([]string, len(posts))
		for i, p := range posts {
			postIDs[i] = p.ID
		}
		attachmentsByPost, err := r.listAttachmentsForPosts(ctx, postIDs)
		if err != nil {
			return nil, err
		}
		for _, p := range posts {
			p.Attachments = attachmentsByPost[p.ID]
			if p.Attachments == nil {
				p.Attachments = []model.PostAttachment{}
			}
		}
	}

	if posts == nil {
		posts = []*model.Post{}
	}
	return posts, nil
}

// Update modifies a post's body.
func (r *PostRepository) Update(ctx context.Context, id, userID, body string) (*model.Post, error) {
	var post model.Post
	err := r.db.QueryRow(ctx, `
		WITH upd AS (
			UPDATE posts SET body = $3, updated_at = NOW()
			WHERE id = $1 AND user_id = $2
			RETURNING id, user_id, body, league_id, club_id, visibility, hidden_at, like_count, comment_count, created_at, updated_at
		)
		SELECT upd.id, upd.user_id, u.display_name, u.avatar_url,
		       upd.body, upd.league_id, upd.club_id, upd.visibility, upd.hidden_at,
		       upd.like_count, upd.comment_count,
		       FALSE AS is_flagged, NULL::text AS flag_reason,
		       upd.created_at, upd.updated_at
		FROM upd
		JOIN users u ON u.id = upd.user_id
	`, id, userID, body).Scan(
		&post.ID, &post.UserID, &post.DisplayName, &post.AvatarURL,
		&post.Body, &post.LeagueID, &post.ClubID, &post.Visibility, &post.HiddenAt,
		&post.LikeCount, &post.CommentCount,
		&post.IsFlagged, &post.FlagReason,
		&post.CreatedAt, &post.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update post: %w", err)
	}

	var attErr error
	post.Attachments, attErr = r.listAttachments(ctx, post.ID)
	if attErr != nil {
		return nil, attErr
	}

	return &post, nil
}

// SetPostFlag sets or clears the moderation-flag columns on a post. Passing
// flaggerID == nil clears all flag columns. Idempotent.
func (r *PostRepository) SetPostFlag(
	ctx context.Context,
	postID string,
	flaggerID *string,
	reason *string,
	scope *string,
	scopeID *string,
) error {
	var (
		tag pgconn.CommandTag
		err error
	)
	if flaggerID == nil {
		tag, err = r.db.Exec(ctx, `
			UPDATE posts
			SET flagged_at = NULL,
			    flagged_by = NULL,
			    flag_reason = NULL,
			    flag_scope = NULL,
			    flag_scope_id = NULL
			WHERE id = $1
		`, postID)
	} else {
		tag, err = r.db.Exec(ctx, `
			UPDATE posts
			SET flagged_at = NOW(),
			    flagged_by = $2::uuid,
			    flag_reason = $3,
			    flag_scope = $4,
			    flag_scope_id = $5::uuid
			WHERE id = $1
		`, postID, *flaggerID, reason, scope, scopeID)
	}
	if err != nil {
		return fmt.Errorf("set post flag: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ResolvePostScope returns the league and club a post belongs to. Either may
// be nil (personal posts belong to neither). Returns ErrNotFound when the
// post is missing.
func (r *PostRepository) ResolvePostScope(
	ctx context.Context, postID string,
) (leagueID *string, clubID *string, err error) {
	err = r.db.QueryRow(ctx,
		`SELECT league_id, club_id FROM posts WHERE id = $1`,
		postID,
	).Scan(&leagueID, &clubID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("resolve post scope: %w", err)
	}
	return leagueID, clubID, nil
}

// SetHidden flips the hidden_at flag for a post. Used by the moderation flow.
func (r *PostRepository) SetHidden(ctx context.Context, id string, hidden bool) error {
	var query string
	if hidden {
		query = `UPDATE posts SET hidden_at = NOW() WHERE id = $1`
	} else {
		query = `UPDATE posts SET hidden_at = NULL WHERE id = $1`
	}
	tag, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("set hidden: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes a post, enforcing ownership.
func (r *PostRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM posts WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostRepository) listAttachments(ctx context.Context, postID string) ([]model.PostAttachment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, type::text, target_id, image_url, sort_order
		FROM post_attachments
		WHERE post_id = $1
		ORDER BY sort_order ASC
	`, postID)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}
	defer rows.Close()

	var attachments []model.PostAttachment
	for rows.Next() {
		var a model.PostAttachment
		if err := rows.Scan(&a.ID, &a.Type, &a.TargetID, &a.ImageURL, &a.SortOrder); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		attachments = append(attachments, a)
	}
	if attachments == nil {
		attachments = []model.PostAttachment{}
	}
	return attachments, nil
}

// listAttachmentsForPosts loads attachments for many posts in a single query,
// grouped by post_id.
func (r *PostRepository) listAttachmentsForPosts(ctx context.Context, postIDs []string) (map[string][]model.PostAttachment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT post_id, id, type::text, target_id, image_url, sort_order
		FROM post_attachments
		WHERE post_id = ANY($1)
		ORDER BY post_id, sort_order ASC
	`, postIDs)
	if err != nil {
		return nil, fmt.Errorf("list attachments for posts: %w", err)
	}
	defer rows.Close()

	byPost := make(map[string][]model.PostAttachment, len(postIDs))
	for rows.Next() {
		var postID string
		var a model.PostAttachment
		if err := rows.Scan(&postID, &a.ID, &a.Type, &a.TargetID, &a.ImageURL, &a.SortOrder); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		byPost[postID] = append(byPost[postID], a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list attachments for posts rows: %w", err)
	}
	return byPost, nil
}
