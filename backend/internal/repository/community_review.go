package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type CommunityReviewRepository struct {
	db *pgxpool.Pool
}

func NewCommunityReviewRepository(db *pgxpool.Pool) *CommunityReviewRepository {
	return &CommunityReviewRepository{db: db}
}

// Create inserts a new open review request for the given score card.
// Returns ErrConflict if a request already exists for the card.
func (r *CommunityReviewRepository) Create(ctx context.Context, scoreCardID, requestedBy string, requiredConfirmations int16) (*model.CommunityReviewRequest, error) {
	var req model.CommunityReviewRequest
	err := r.db.QueryRow(ctx, `
		INSERT INTO community_review_requests (score_card_id, requested_by, required_confirmations)
		VALUES ($1, $2, $3)
		RETURNING id, score_card_id, requested_by, required_confirmations, status, created_at, resolved_at
	`, scoreCardID, requestedBy, requiredConfirmations).Scan(
		&req.ID, &req.ScoreCardID, &req.RequestedBy, &req.RequiredConfirmations,
		&req.Status, &req.CreatedAt, &req.ResolvedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create community review request: %w", err)
	}
	return &req, nil
}

// GetByScoreCard returns the request row for the given card or ErrNotFound.
func (r *CommunityReviewRepository) GetByScoreCard(ctx context.Context, scoreCardID string) (*model.CommunityReviewRequest, error) {
	var req model.CommunityReviewRequest
	err := r.db.QueryRow(ctx, `
		SELECT id, score_card_id, requested_by, required_confirmations, status, created_at, resolved_at
		FROM community_review_requests
		WHERE score_card_id = $1
	`, scoreCardID).Scan(
		&req.ID, &req.ScoreCardID, &req.RequestedBy, &req.RequiredConfirmations,
		&req.Status, &req.CreatedAt, &req.ResolvedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get community review request: %w", err)
	}
	return &req, nil
}

// MarkVerified flips the request status to 'verified'. Idempotent.
func (r *CommunityReviewRepository) MarkVerified(ctx context.Context, scoreCardID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE community_review_requests
		SET status = 'verified', resolved_at = NOW()
		WHERE score_card_id = $1 AND status = 'open'
	`, scoreCardID)
	if err != nil {
		return fmt.Errorf("mark community review verified: %w", err)
	}
	return nil
}

// Cancel removes the request row. Confirmations on score_confirmations are kept
// (they're harmless without an open request) but the row goes away so the owner
// can reopen later if desired.
func (r *CommunityReviewRepository) Cancel(ctx context.Context, scoreCardID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM community_review_requests
		WHERE score_card_id = $1 AND status = 'open'
	`, scoreCardID)
	if err != nil {
		return fmt.Errorf("cancel community review request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountConfirmationsByUser counts confirmations a user has given on score
// cards that have a community_review_requests row (i.e. excludes pure-league
// confirmations) — used to gate community-reviewer achievements.
func (r *CommunityReviewRepository) CountConfirmationsByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM score_confirmations sc
		JOIN community_review_requests cr ON cr.score_card_id = sc.score_card_id
		WHERE sc.confirmed_by = $1
	`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count community confirmations: %w", err)
	}
	return count, nil
}
