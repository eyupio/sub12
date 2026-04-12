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
func (r *CommentRepository) Create(ctx context.Context, cardID, userID, body string) (*model.Comment, error) {
	var c model.Comment
	err := r.db.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO score_card_comments (card_id, user_id, body, updated_at)
			VALUES ($1, $2, $3, NOW())
			RETURNING id, card_id, user_id, body, created_at, updated_at
		)
		SELECT ins.id, ins.card_id, ins.user_id, u.display_name, u.avatar_url,
		       ins.body, ins.created_at, ins.updated_at
		FROM ins
		JOIN users u ON u.id = ins.user_id
	`, cardID, userID, body).Scan(
		&c.ID, &c.CardID, &c.UserID, &c.DisplayName, &c.AvatarURL,
		&c.Body, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return &c, nil
}

// List returns all comments for a card, oldest first, joined with author info.
func (r *CommentRepository) List(ctx context.Context, cardID string) ([]*model.Comment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.card_id, c.user_id, u.display_name, u.avatar_url,
		       c.body, c.created_at, c.updated_at
		FROM score_card_comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.card_id = $1
		ORDER BY c.created_at ASC
	`, cardID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	defer rows.Close()

	var comments []*model.Comment
	for rows.Next() {
		var c model.Comment
		if err := rows.Scan(
			&c.ID, &c.CardID, &c.UserID, &c.DisplayName, &c.AvatarURL,
			&c.Body, &c.CreatedAt, &c.UpdatedAt,
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

// Update edits a comment body, enforcing ownership via user_id.
// Returns ErrNotFound if the comment does not exist or belongs to another user.
func (r *CommentRepository) Update(ctx context.Context, commentID, userID, body string) (*model.Comment, error) {
	var c model.Comment
	err := r.db.QueryRow(ctx, `
		WITH upd AS (
			UPDATE score_card_comments
			SET body = $3, updated_at = NOW()
			WHERE id = $1 AND user_id = $2
			RETURNING id, card_id, user_id, body, created_at, updated_at
		)
		SELECT upd.id, upd.card_id, upd.user_id, u.display_name, u.avatar_url,
		       upd.body, upd.created_at, upd.updated_at
		FROM upd
		JOIN users u ON u.id = upd.user_id
	`, commentID, userID, body).Scan(
		&c.ID, &c.CardID, &c.UserID, &c.DisplayName, &c.AvatarURL,
		&c.Body, &c.CreatedAt, &c.UpdatedAt,
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
// Returns ErrNotFound if the comment does not exist or belongs to another user.
func (r *CommentRepository) Delete(ctx context.Context, commentID, userID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM score_card_comments WHERE id = $1 AND user_id = $2`,
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
