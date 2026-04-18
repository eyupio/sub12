package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type SupportTicketRepository struct {
	db *pgxpool.Pool
}

func NewSupportTicketRepository(db *pgxpool.Pool) *SupportTicketRepository {
	return &SupportTicketRepository{db: db}
}

func (r *SupportTicketRepository) Create(ctx context.Context, requesterID string, in *model.CreateSupportTicketInput) (*model.SupportTicket, error) {
	t := &model.SupportTicket{}
	priority := in.Priority
	if priority == "" {
		priority = model.SupportPriorityNormal
	}
	err := r.db.QueryRow(ctx, `
		INSERT INTO support_tickets (requester_id, scope_type, scope_id, category, title, description, status, priority)
		VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
		RETURNING id, requester_id, scope_type, scope_id, category, title, description, status, priority, assignee_id, created_at, updated_at, closed_at
	`, requesterID, in.ScopeType, in.ScopeID, in.Category, in.Title, in.Description, priority).Scan(
		&t.ID, &t.RequesterID, &t.ScopeType, &t.ScopeID, &t.Category, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.AssigneeID, &t.CreatedAt, &t.UpdatedAt, &t.ClosedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert support ticket: %w", err)
	}
	_, err = r.db.Exec(ctx, `
		INSERT INTO support_ticket_participants (ticket_id, user_id, role, last_read_at)
		VALUES ($1, $2, 'requester', NOW())
		ON CONFLICT (ticket_id, user_id) DO UPDATE SET role = EXCLUDED.role, last_read_at = EXCLUDED.last_read_at
	`, t.ID, requesterID)
	if err != nil {
		return nil, fmt.Errorf("insert requester participant: %w", err)
	}
	return t, nil
}

func (r *SupportTicketRepository) List(ctx context.Context, in *model.ListSupportTicketsInput) ([]*model.SupportTicket, error) {
	if in == nil {
		in = &model.ListSupportTicketsInput{}
	}
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `
		SELECT t.id, t.requester_id, t.scope_type, t.scope_id, t.category, t.title, t.description, t.status, t.priority,
		       t.assignee_id, t.created_at, t.updated_at, t.closed_at,
		       COALESCE((
		           SELECT count(1)
		           FROM support_ticket_messages m
		           LEFT JOIN support_ticket_participants p
		               ON p.ticket_id = m.ticket_id AND p.user_id = $1
		           WHERE m.ticket_id = t.id
		             AND m.internal_note = FALSE
		             AND m.author_id <> $1
		             AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
		       ), 0) AS unread_count
		FROM support_tickets t
	`
	args := []any{nil}
	where := []string{}
	if in.ParticipantID != nil && *in.ParticipantID != "" {
		args[0] = *in.ParticipantID
		args = append(args, *in.ParticipantID)
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM support_ticket_participants p WHERE p.ticket_id = t.id AND p.user_id = $%d)", len(args)))
	}
	if in.RequesterID != nil && *in.RequesterID != "" {
		args = append(args, *in.RequesterID)
		where = append(where, fmt.Sprintf("t.requester_id = $%d", len(args)))
	}
	if in.AssigneeID != nil && *in.AssigneeID != "" {
		args = append(args, *in.AssigneeID)
		where = append(where, fmt.Sprintf("t.assignee_id = $%d", len(args)))
	}
	if in.Status != "" {
		args = append(args, in.Status)
		where = append(where, fmt.Sprintf("t.status = $%d", len(args)))
	}
	if in.Category != "" {
		args = append(args, in.Category)
		where = append(where, fmt.Sprintf("t.category = $%d", len(args)))
	}
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
	query += fmt.Sprintf(" ORDER BY t.updated_at DESC LIMIT $%d", len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list support tickets: %w", err)
	}
	defer rows.Close()

	items := []*model.SupportTicket{}
	for rows.Next() {
		t := &model.SupportTicket{}
		if err := rows.Scan(
			&t.ID, &t.RequesterID, &t.ScopeType, &t.ScopeID, &t.Category, &t.Title, &t.Description,
			&t.Status, &t.Priority, &t.AssigneeID, &t.CreatedAt, &t.UpdatedAt, &t.ClosedAt, &t.UnreadCount,
		); err != nil {
			return nil, fmt.Errorf("scan support ticket: %w", err)
		}
		items = append(items, t)
	}
	return items, nil
}

func (r *SupportTicketRepository) GetByID(ctx context.Context, id string) (*model.SupportTicket, error) {
	t := &model.SupportTicket{}
	err := r.db.QueryRow(ctx, `
		SELECT id, requester_id, scope_type, scope_id, category, title, description, status, priority,
		       assignee_id, created_at, updated_at, closed_at
		FROM support_tickets WHERE id = $1
	`, id).Scan(
		&t.ID, &t.RequesterID, &t.ScopeType, &t.ScopeID, &t.Category, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.AssigneeID, &t.CreatedAt, &t.UpdatedAt, &t.ClosedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get support ticket: %w", err)
	}
	return t, nil
}

func (r *SupportTicketRepository) Update(ctx context.Context, id, actorID string, in *model.UpdateSupportTicketInput) (*model.SupportTicket, error) {
	if in == nil {
		return r.GetByID(ctx, id)
	}
	current, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	category := current.Category
	if in.Category != nil {
		category = *in.Category
	}
	status := current.Status
	if in.Status != nil {
		status = *in.Status
	}
	priority := current.Priority
	if in.Priority != nil {
		priority = *in.Priority
	}
	assigneeID := current.AssigneeID
	if in.AssigneeID != nil {
		assigneeID = in.AssigneeID
	}

	var closedAt *time.Time
	if status == model.SupportStatusClosed || status == model.SupportStatusResolved {
		now := time.Now().UTC()
		closedAt = &now
	}
	updated := &model.SupportTicket{}
	err = r.db.QueryRow(ctx, `
		UPDATE support_tickets
		SET category = $2,
		    status = $3,
		    priority = $4,
		    assignee_id = $5,
		    updated_at = NOW(),
		    closed_at = $6
		WHERE id = $1
		RETURNING id, requester_id, scope_type, scope_id, category, title, description, status, priority, assignee_id, created_at, updated_at, closed_at
	`, id, category, status, priority, assigneeID, closedAt).Scan(
		&updated.ID, &updated.RequesterID, &updated.ScopeType, &updated.ScopeID, &updated.Category, &updated.Title,
		&updated.Description, &updated.Status, &updated.Priority, &updated.AssigneeID, &updated.CreatedAt, &updated.UpdatedAt, &updated.ClosedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update support ticket: %w", err)
	}

	if actorID != "" {
		r.recordChangeEvent(ctx, id, actorID, "category_changed", &current.Category, in.Category)
		r.recordChangeEvent(ctx, id, actorID, "status_changed", &current.Status, in.Status)
		r.recordChangeEvent(ctx, id, actorID, "priority_changed", &current.Priority, in.Priority)
		r.recordChangeEvent(ctx, id, actorID, "assignee_changed", current.AssigneeID, in.AssigneeID)
	}
	if assigneeID != nil && *assigneeID != "" {
		_, _ = r.db.Exec(ctx, `
			INSERT INTO support_ticket_participants (ticket_id, user_id, role)
			VALUES ($1, $2, 'admin')
			ON CONFLICT (ticket_id, user_id) DO NOTHING
		`, id, *assigneeID)
	}
	return updated, nil
}

func (r *SupportTicketRepository) AddMessage(ctx context.Context, ticketID, authorID string, in *model.AddSupportTicketMessageInput) (*model.SupportTicketMessage, error) {
	m := &model.SupportTicketMessage{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO support_ticket_messages (ticket_id, author_id, body, internal_note)
		VALUES ($1, $2, $3, $4)
		RETURNING id, ticket_id, author_id, body, internal_note, created_at
	`, ticketID, authorID, in.Body, in.InternalNote).Scan(
		&m.ID, &m.TicketID, &m.AuthorID, &m.Body, &m.InternalNote, &m.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert support ticket message: %w", err)
	}
	_, _ = r.db.Exec(ctx, `
		INSERT INTO support_ticket_participants (ticket_id, user_id, role, last_read_at)
		VALUES ($1, $2, 'observer', NOW())
		ON CONFLICT (ticket_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at
	`, ticketID, authorID)
	_, _ = r.db.Exec(ctx, `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, ticketID)
	return m, nil
}

func (r *SupportTicketRepository) MarkRead(ctx context.Context, ticketID, userID string, at *time.Time) error {
	readAt := time.Now().UTC()
	if at != nil {
		readAt = at.UTC()
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO support_ticket_participants (ticket_id, user_id, role, last_read_at)
		VALUES ($1, $2, 'observer', $3)
		ON CONFLICT (ticket_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at
	`, ticketID, userID, readAt)
	if err != nil {
		return fmt.Errorf("mark support ticket read: %w", err)
	}
	return nil
}

func (r *SupportTicketRepository) recordChangeEvent(ctx context.Context, ticketID, actorID, eventType string, fromValue, toValue *string) {
	if toValue == nil {
		return
	}
	if fromValue != nil && *fromValue == *toValue {
		return
	}
	_, _ = r.db.Exec(ctx, `
		INSERT INTO support_ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
		VALUES ($1, $2, $3, $4, $5)
	`, ticketID, actorID, eventType, fromValue, toValue)
}
