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

// featureRequestSelect is the one shape every read returns: the request plus the
// names the board renders (requester, owner, scope) and its vote/comment counts.
// $1 is always the viewer, so `viewer_has_voted` comes back on every row.
const featureRequestSelect = `
	SELECT fr.id, fr.ticket_id, fr.title, fr.refined_description, fr.status, fr.priority,
	       fr.owner_admin_id, owner.display_name,
	       t.requester_id, requester.display_name,
	       t.scope_type, t.scope_id, COALESCE(l.name, c.name) AS scope_name,
	       fr.created_at, fr.updated_at,
	       COALESCE(v.vote_count, 0) AS vote_count,
	       COALESCE(cm.comment_count, 0) AS comment_count,
	       EXISTS (
	         SELECT 1 FROM feature_request_votes vr
	         WHERE vr.feature_request_id = fr.id AND vr.voter_id = $1
	       ) AS viewer_has_voted
	FROM feature_requests fr
	JOIN support_tickets t ON t.id = fr.ticket_id
	JOIN users requester ON requester.id = t.requester_id
	LEFT JOIN users owner ON owner.id = fr.owner_admin_id
	LEFT JOIN leagues l ON t.scope_type = 'league' AND l.id = t.scope_id
	LEFT JOIN clubs c ON t.scope_type = 'club' AND c.id = t.scope_id
	LEFT JOIN (
	  SELECT feature_request_id, COUNT(*)::int AS vote_count
	  FROM feature_request_votes
	  GROUP BY feature_request_id
	) v ON v.feature_request_id = fr.id
	LEFT JOIN (
	  SELECT target_id, COUNT(*)::int AS comment_count
	  FROM comments
	  WHERE target_type = 'feature_request'
	  GROUP BY target_id
	) cm ON cm.target_id = fr.id
`

func scanFeatureRequest(row pgx.Row) (*model.FeatureRequest, error) {
	item := &model.FeatureRequest{}
	err := row.Scan(
		&item.ID, &item.TicketID, &item.Title, &item.RefinedDescription, &item.Status, &item.Priority,
		&item.OwnerAdminID, &item.OwnerAdminName,
		&item.RequesterID, &item.RequesterName,
		&item.ScopeType, &item.ScopeID, &item.ScopeName,
		&item.CreatedAt, &item.UpdatedAt,
		&item.VoteCount, &item.CommentCount, &item.ViewerHasVoted,
	)
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (r *FeatureRequestRepository) CreateFromTicket(ctx context.Context, ticket *model.SupportTicket, actorID string, in *model.CreateFeatureRequestFromTicketInput) (*model.FeatureRequest, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO feature_requests (ticket_id, title, refined_description, status, priority, owner_admin_id)
		VALUES ($1, $2, $3, 'refining', $4, $5)
		ON CONFLICT (ticket_id) DO UPDATE
		SET title = EXCLUDED.title,
		    refined_description = EXCLUDED.refined_description,
		    owner_admin_id = EXCLUDED.owner_admin_id,
		    updated_at = NOW()
		RETURNING id
	`, ticket.ID, in.Title, in.RefinedDescription, featureRequestPriorityFromTicket(ticket), in.OwnerAdminID).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create feature request from ticket: %w", err)
	}
	// Opening event, written once. A re-run of the conversion updates the
	// existing request rather than creating a second origin.
	_, _ = r.db.Exec(ctx, `
		INSERT INTO feature_request_events (feature_request_id, actor_id, event_type, to_value)
		SELECT $1, $2, 'created', fr.status
		FROM feature_requests fr
		WHERE fr.id = $1
		  AND NOT EXISTS (
		    SELECT 1 FROM feature_request_events e
		    WHERE e.feature_request_id = $1 AND e.event_type = 'created'
		  )
	`, id, viewerOrNil(actorID))
	return r.GetByID(ctx, id, "")
}

// featureRequestPriorityFromTicket carries the requester's stated urgency onto
// the board so a new request doesn't land unprioritised.
func featureRequestPriorityFromTicket(ticket *model.SupportTicket) string {
	if ticket != nil && model.IsValidFeatureRequestPriority(ticket.Priority) {
		return ticket.Priority
	}
	return model.FeatureRequestPriorityNormal
}

func (r *FeatureRequestRepository) GetByID(ctx context.Context, id string, viewerID string) (*model.FeatureRequest, error) {
	viewer := viewerOrNil(viewerID)
	item, err := scanFeatureRequest(r.db.QueryRow(ctx, featureRequestSelect+` WHERE fr.id = $2`, viewer, id))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get feature request: %w", err)
	}
	return item, nil
}

func (r *FeatureRequestRepository) List(ctx context.Context, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	return r.list(ctx, in, "fr.updated_at DESC")
}

func (r *FeatureRequestRepository) ListRanked(ctx context.Context, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	return r.list(ctx, in, "COALESCE(v.vote_count, 0) DESC, fr.created_at DESC")
}

func (r *FeatureRequestRepository) list(ctx context.Context, in *model.ListFeatureRequestsInput, orderBy string) ([]*model.FeatureRequest, error) {
	if in == nil {
		in = &model.ListFeatureRequestsInput{}
	}
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{viewerOrNil(in.ViewerID)}
	query := featureRequestSelect

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
	query += fmt.Sprintf(" ORDER BY %s LIMIT $%d", orderBy, len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list feature requests: %w", err)
	}
	defer rows.Close()

	items := []*model.FeatureRequest{}
	for rows.Next() {
		item, err := scanFeatureRequest(rows)
		if err != nil {
			return nil, fmt.Errorf("scan feature request: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
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
	priority := current.Priority
	if in.Priority != nil {
		priority = *in.Priority
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
		    priority = $5,
		    owner_admin_id = $6,
		    updated_at = NOW()
		WHERE id = $1
	`, id, title, refined, status, priority, owner)
	if err != nil {
		return nil, fmt.Errorf("update feature request: %w", err)
	}

	r.RecordEvent(ctx, id, viewerID, model.FeatureRequestEventStatusChanged, &current.Status, &status)
	r.RecordEvent(ctx, id, viewerID, model.FeatureRequestEventPriorityChanged, &current.Priority, &priority)
	r.RecordEvent(ctx, id, viewerID, model.FeatureRequestEventOwnerChanged, current.OwnerAdminID, owner)

	return r.GetByID(ctx, id, viewerID)
}

// RecordEvent appends a history entry. Unchanged values are dropped so the
// timeline only ever shows real transitions.
func (r *FeatureRequestRepository) RecordEvent(ctx context.Context, featureRequestID, actorID, eventType string, fromValue, toValue *string) {
	if fromValue != nil && toValue != nil && *fromValue == *toValue {
		return
	}
	if fromValue == nil && toValue == nil {
		return
	}
	_, _ = r.db.Exec(ctx, `
		INSERT INTO feature_request_events (feature_request_id, actor_id, event_type, from_value, to_value)
		VALUES ($1, $2, $3, $4, $5)
	`, featureRequestID, viewerOrNil(actorID), eventType, fromValue, toValue)
}

func (r *FeatureRequestRepository) ListEvents(ctx context.Context, featureRequestID string) ([]*model.FeatureRequestEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT e.id, e.feature_request_id, e.actor_id, u.display_name, e.event_type, e.from_value, e.to_value, e.created_at
		FROM feature_request_events e
		LEFT JOIN users u ON u.id = e.actor_id
		WHERE e.feature_request_id = $1
		ORDER BY e.created_at ASC, e.id ASC
	`, featureRequestID)
	if err != nil {
		return nil, fmt.Errorf("list feature request events: %w", err)
	}
	defer rows.Close()

	items := []*model.FeatureRequestEvent{}
	for rows.Next() {
		item := &model.FeatureRequestEvent{}
		if err := rows.Scan(&item.ID, &item.FeatureRequestID, &item.ActorID, &item.ActorName, &item.EventType, &item.FromValue, &item.ToValue, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan feature request event: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
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

func (r *FeatureRequestRepository) Delete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM feature_requests WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete feature request: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// viewerOrNil keeps an empty viewer out of the UUID comparisons — pgx rejects
// "" as a uuid, and an anonymous read simply has no votes of its own.
func viewerOrNil(userID string) *string {
	if userID == "" {
		return nil
	}
	return &userID
}
