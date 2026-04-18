package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type FeatureRequestRepository struct {
	db *pgxpool.Pool
}

func NewFeatureRequestRepository(db *pgxpool.Pool) *FeatureRequestRepository {
	return &FeatureRequestRepository{db: db}
}

func (r *FeatureRequestRepository) CreateFromTicket(ctx context.Context, ticket *model.SupportTicket, in *model.CreateFeatureRequestFromTicketInput) (*model.FeatureRequest, error) {
	item := &model.FeatureRequest{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO feature_requests (ticket_id, title, refined_description, status, owner_admin_id)
		VALUES ($1, $2, $3, 'refining', $4)
		ON CONFLICT (ticket_id) DO UPDATE
		SET title = EXCLUDED.title,
		    refined_description = EXCLUDED.refined_description,
		    owner_admin_id = EXCLUDED.owner_admin_id,
		    updated_at = NOW()
		RETURNING id, ticket_id, title, refined_description, status, owner_admin_id, created_at, updated_at
	`, ticket.ID, in.Title, in.RefinedDescription, in.OwnerAdminID).Scan(
		&item.ID, &item.TicketID, &item.Title, &item.RefinedDescription, &item.Status, &item.OwnerAdminID, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create feature request from ticket: %w", err)
	}
	item.ScopeType = ticket.ScopeType
	item.ScopeID = ticket.ScopeID
	return item, nil
}

func (r *FeatureRequestRepository) GetByID(ctx context.Context, id string, viewerID string) (*model.FeatureRequest, error) {
	item := &model.FeatureRequest{}
	err := r.db.QueryRow(ctx, `
		SELECT fr.id, fr.ticket_id, fr.title, fr.refined_description, fr.status, fr.owner_admin_id,
		       t.scope_type, t.scope_id, fr.created_at, fr.updated_at,
		       COALESCE(v.vote_count, 0) AS vote_count,
		       EXISTS (
		         SELECT 1 FROM feature_request_votes vr
		         WHERE vr.feature_request_id = fr.id AND vr.voter_id = $2
		       ) AS viewer_has_voted
		FROM feature_requests fr
		JOIN support_tickets t ON t.id = fr.ticket_id
		LEFT JOIN (
		  SELECT feature_request_id, COUNT(*)::int AS vote_count
		  FROM feature_request_votes
		  GROUP BY feature_request_id
		) v ON v.feature_request_id = fr.id
		WHERE fr.id = $1
	`, id, viewerID).Scan(
		&item.ID, &item.TicketID, &item.Title, &item.RefinedDescription, &item.Status, &item.OwnerAdminID,
		&item.ScopeType, &item.ScopeID, &item.CreatedAt, &item.UpdatedAt, &item.VoteCount, &item.ViewerHasVoted,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get feature request: %w", err)
	}
	return item, nil
}

func (r *FeatureRequestRepository) List(ctx context.Context, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	if in == nil {
		in = &model.ListFeatureRequestsInput{}
	}
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{in.ViewerID}
	query := `
		SELECT fr.id, fr.ticket_id, fr.title, fr.refined_description, fr.status, fr.owner_admin_id,
		       t.scope_type, t.scope_id, fr.created_at, fr.updated_at,
		       COALESCE(v.vote_count, 0) AS vote_count,
		       EXISTS (
		         SELECT 1 FROM feature_request_votes vr
		         WHERE vr.feature_request_id = fr.id AND vr.voter_id = $1
		       ) AS viewer_has_voted
		FROM feature_requests fr
		JOIN support_tickets t ON t.id = fr.ticket_id
		LEFT JOIN (
		  SELECT feature_request_id, COUNT(*)::int AS vote_count
		  FROM feature_request_votes
		  GROUP BY feature_request_id
		) v ON v.feature_request_id = fr.id
	`
	where := []string{}
	if in.ScopeType != "" {
		args = append(args, in.ScopeType)
		where = append(where, fmt.Sprintf("t.scope_type = $%d", len(args)))
	}
	if in.ScopeID != "" {
		args = append(args, in.ScopeID)
		where = append(where, fmt.Sprintf("t.scope_id = $%d", len(args)))
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit)
	query += fmt.Sprintf(" ORDER BY fr.updated_at DESC LIMIT $%d", len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list feature requests: %w", err)
	}
	defer rows.Close()

	items := []*model.FeatureRequest{}
	for rows.Next() {
		item := &model.FeatureRequest{}
		if err := rows.Scan(
			&item.ID, &item.TicketID, &item.Title, &item.RefinedDescription, &item.Status, &item.OwnerAdminID,
			&item.ScopeType, &item.ScopeID, &item.CreatedAt, &item.UpdatedAt, &item.VoteCount, &item.ViewerHasVoted,
		); err != nil {
			return nil, fmt.Errorf("scan feature request: %w", err)
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *FeatureRequestRepository) ListRanked(ctx context.Context, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	if in == nil {
		in = &model.ListFeatureRequestsInput{}
	}
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{in.ViewerID}
	query := `
		SELECT fr.id, fr.ticket_id, fr.title, fr.refined_description, fr.status, fr.owner_admin_id,
		       t.scope_type, t.scope_id, fr.created_at, fr.updated_at,
		       COALESCE(v.vote_count, 0) AS vote_count,
		       EXISTS (
		         SELECT 1 FROM feature_request_votes vr
		         WHERE vr.feature_request_id = fr.id AND vr.voter_id = $1
		       ) AS viewer_has_voted
		FROM feature_requests fr
		JOIN support_tickets t ON t.id = fr.ticket_id
		LEFT JOIN (
		  SELECT feature_request_id, COUNT(*)::int AS vote_count
		  FROM feature_request_votes
		  GROUP BY feature_request_id
		) v ON v.feature_request_id = fr.id
	`
	where := []string{}
	if in.ScopeType != "" {
		args = append(args, in.ScopeType)
		where = append(where, fmt.Sprintf("t.scope_type = $%d", len(args)))
	}
	if in.ScopeID != "" {
		args = append(args, in.ScopeID)
		where = append(where, fmt.Sprintf("t.scope_id = $%d", len(args)))
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit)
	query += fmt.Sprintf(" ORDER BY COALESCE(v.vote_count, 0) DESC, fr.created_at DESC LIMIT $%d", len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list ranked feature requests: %w", err)
	}
	defer rows.Close()

	items := []*model.FeatureRequest{}
	for rows.Next() {
		item := &model.FeatureRequest{}
		if err := rows.Scan(
			&item.ID, &item.TicketID, &item.Title, &item.RefinedDescription, &item.Status, &item.OwnerAdminID,
			&item.ScopeType, &item.ScopeID, &item.CreatedAt, &item.UpdatedAt, &item.VoteCount, &item.ViewerHasVoted,
		); err != nil {
			return nil, fmt.Errorf("scan ranked feature request: %w", err)
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *FeatureRequestRepository) Update(ctx context.Context, id string, in *model.UpdateFeatureRequestInput, viewerID string) (*model.FeatureRequest, error) {
	current, err := r.GetByID(ctx, id, viewerID)
	if err != nil {
		return nil, err
	}
	title := current.Title
	if in.Title != nil {
		title = *in.Title
	}
	refined := current.RefinedDescription
	if in.RefinedDescription != nil {
		refined = *in.RefinedDescription
	}
	status := current.Status
	if in.Status != nil {
		status = *in.Status
	}
	owner := current.OwnerAdminID
	if in.OwnerAdminID != nil {
		owner = in.OwnerAdminID
	}
	_, err = r.db.Exec(ctx, `
		UPDATE feature_requests
		SET title = $2,
		    refined_description = $3,
		    status = $4,
		    owner_admin_id = $5,
		    updated_at = NOW()
		WHERE id = $1
	`, id, title, refined, status, owner)
	if err != nil {
		return nil, fmt.Errorf("update feature request: %w", err)
	}
	return r.GetByID(ctx, id, viewerID)
}

func (r *FeatureRequestRepository) AddVote(ctx context.Context, featureRequestID, voterID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO feature_request_votes (feature_request_id, voter_id)
		VALUES ($1, $2)
		ON CONFLICT (feature_request_id, voter_id) DO NOTHING
	`, featureRequestID, voterID)
	if err != nil {
		return fmt.Errorf("insert feature request vote: %w", err)
	}
	return nil
}

func (r *FeatureRequestRepository) RemoveVote(ctx context.Context, featureRequestID, voterID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM feature_request_votes
		WHERE feature_request_id = $1 AND voter_id = $2
	`, featureRequestID, voterID)
	if err != nil {
		return fmt.Errorf("delete feature request vote: %w", err)
	}
	return nil
}
