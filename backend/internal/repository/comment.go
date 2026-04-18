package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type CommentRepository struct {
	db *pgxpool.Pool
}

func NewCommentRepository(db *pgxpool.Pool) *CommentRepository {
	return &CommentRepository{db: db}
}

// Create inserts a new comment and returns it with the author's display name.
func (r *CommentRepository) Create(ctx context.Context, targetID, targetType, userID, body string, parentID *string) (*model.Comment, error) {
	var c model.Comment
	err := r.db.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO comments (target_id, target_type, user_id, body, parent_id, updated_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			RETURNING id, target_id, target_type, parent_id, user_id, body, like_count, created_at, updated_at
		)
		SELECT ins.id, ins.target_id, ins.target_type, ins.parent_id, ins.user_id,
		       u.display_name, u.avatar_url,
		       ins.body, ins.like_count, 0 AS reply_count, FALSE AS is_liked, ins.created_at, ins.updated_at
		FROM ins
		JOIN users u ON u.id = ins.user_id
	`, targetID, targetType, userID, body, parentID).Scan(
		&c.ID, &c.TargetID, &c.TargetType, &c.ParentID, &c.UserID,
		&c.DisplayName, &c.AvatarURL,
		&c.Body, &c.LikeCount, &c.ReplyCount, &c.IsLiked, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return &c, nil
}

// ListByTargetWithViewer returns top-level comments for a target, oldest first,
// including an is_liked flag scoped to viewerID (empty for anonymous viewers).
func (r *CommentRepository) ListByTargetWithViewer(ctx context.Context, targetID, targetType, viewerID string) ([]*model.Comment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.target_id, c.target_type, c.parent_id, c.user_id,
		       u.display_name, u.avatar_url,
		       c.body, c.like_count,
		       (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
		       CASE WHEN $3 = '' THEN FALSE
		            ELSE EXISTS (SELECT 1 FROM likes l
		                         WHERE l.target_id = c.id AND l.target_type = 'comment' AND l.user_id = $3::uuid)
		       END AS is_liked,
		       c.created_at, c.updated_at
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.target_id = $1 AND c.target_type = $2 AND c.parent_id IS NULL AND c.hidden_at IS NULL
		ORDER BY c.created_at ASC
	`, targetID, targetType, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	defer rows.Close()

	var comments []*model.Comment
	for rows.Next() {
		var c model.Comment
		if err := rows.Scan(
			&c.ID, &c.TargetID, &c.TargetType, &c.ParentID, &c.UserID,
			&c.DisplayName, &c.AvatarURL,
			&c.Body, &c.LikeCount, &c.ReplyCount, &c.IsLiked, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan comment: %w", err)
		}
		comments = append(comments, &c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list comments rows: %w", err)
	}
	if comments == nil {
		comments = []*model.Comment{}
	}
	return comments, nil
}

// ListByTarget returns top-level comments for a target, oldest first.
func (r *CommentRepository) ListByTarget(ctx context.Context, targetID, targetType string) ([]*model.Comment, error) {
	return r.ListByTargetWithViewer(ctx, targetID, targetType, "")
}

// ListRepliesWithViewer returns replies to a specific comment, oldest first,
// including an is_liked flag scoped to viewerID (empty for anonymous viewers).
func (r *CommentRepository) ListRepliesWithViewer(ctx context.Context, parentID, viewerID string) ([]*model.Comment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.target_id, c.target_type, c.parent_id, c.user_id,
		       u.display_name, u.avatar_url,
		       c.body, c.like_count,
		       (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
		       CASE WHEN $2 = '' THEN FALSE
		            ELSE EXISTS (SELECT 1 FROM likes l
		                         WHERE l.target_id = c.id AND l.target_type = 'comment' AND l.user_id = $2::uuid)
		       END AS is_liked,
		       c.created_at, c.updated_at
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.parent_id = $1 AND c.hidden_at IS NULL
		ORDER BY c.created_at ASC
	`, parentID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list replies: %w", err)
	}
	defer rows.Close()

	var comments []*model.Comment
	for rows.Next() {
		var c model.Comment
		if err := rows.Scan(
			&c.ID, &c.TargetID, &c.TargetType, &c.ParentID, &c.UserID,
			&c.DisplayName, &c.AvatarURL,
			&c.Body, &c.LikeCount, &c.ReplyCount, &c.IsLiked, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan reply: %w", err)
		}
		comments = append(comments, &c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list replies rows: %w", err)
	}
	if comments == nil {
		comments = []*model.Comment{}
	}
	return comments, nil
}

// ListReplies returns replies to a specific comment, oldest first.
func (r *CommentRepository) ListReplies(ctx context.Context, parentID string) ([]*model.Comment, error) {
	return r.ListRepliesWithViewer(ctx, parentID, "")
}

// GetByID retrieves a single comment by ID.
func (r *CommentRepository) GetByID(ctx context.Context, commentID string) (*model.Comment, error) {
	var c model.Comment
	err := r.db.QueryRow(ctx, `
		SELECT c.id, c.target_id, c.target_type, c.parent_id, c.user_id,
		       u.display_name, u.avatar_url,
		       c.body, c.like_count,
		       (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
		       FALSE AS is_liked,
		       c.created_at, c.updated_at
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.id = $1
	`, commentID).Scan(
		&c.ID, &c.TargetID, &c.TargetType, &c.ParentID, &c.UserID,
		&c.DisplayName, &c.AvatarURL,
		&c.Body, &c.LikeCount, &c.ReplyCount, &c.IsLiked, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get comment: %w", err)
	}
	return &c, nil
}

// Update edits a comment body, enforcing ownership via user_id.
func (r *CommentRepository) Update(ctx context.Context, commentID, userID, body string) (*model.Comment, error) {
	var c model.Comment
	err := r.db.QueryRow(ctx, `
		WITH upd AS (
			UPDATE comments
			SET body = $3, updated_at = NOW()
			WHERE id = $1 AND user_id = $2
			RETURNING id, target_id, target_type, parent_id, user_id, body, like_count, created_at, updated_at
		)
		SELECT upd.id, upd.target_id, upd.target_type, upd.parent_id, upd.user_id,
		       u.display_name, u.avatar_url,
		       upd.body, upd.like_count,
		       (SELECT COUNT(*) FROM comments r WHERE r.parent_id = upd.id) AS reply_count,
		       FALSE AS is_liked,
		       upd.created_at, upd.updated_at
		FROM upd
		JOIN users u ON u.id = upd.user_id
	`, commentID, userID, body).Scan(
		&c.ID, &c.TargetID, &c.TargetType, &c.ParentID, &c.UserID,
		&c.DisplayName, &c.AvatarURL,
		&c.Body, &c.LikeCount, &c.ReplyCount, &c.IsLiked, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update comment: %w", err)
	}
	return &c, nil
}

// Delete removes a comment, enforcing ownership via user_id.
func (r *CommentRepository) Delete(ctx context.Context, commentID, userID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM comments WHERE id = $1 AND user_id = $2`,
		commentID, userID,
	)
	if err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountByTarget returns the number of comments for a target.
func (r *CommentRepository) CountByTarget(ctx context.Context, targetID, targetType string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM comments WHERE target_id = $1 AND target_type = $2`,
		targetID, targetType,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count comments: %w", err)
	}
	return count, nil
}

// CountByUser returns the total number of comments authored by the user.
func (r *CommentRepository) CountByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM comments WHERE user_id = $1`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count comments by user: %w", err)
	}
	return count, nil
}
