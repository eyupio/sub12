package model

import "time"

const (
	SupportScopePlatform = "platform"
	SupportScopeLeague   = "league"
	SupportScopeClub     = "club"
)

const (
	SupportCategoryQuestion = "question"
	SupportCategoryIssue    = "issue"
	SupportCategoryFeature  = "feature"
)

const (
	SupportStatusOpen          = "open"
	SupportStatusInProgress    = "in_progress"
	SupportStatusWaitingOnUser = "waiting_on_user"
	SupportStatusResolved      = "resolved"
	SupportStatusClosed        = "closed"
)

const (
	SupportPriorityLow    = "low"
	SupportPriorityNormal = "normal"
	SupportPriorityHigh   = "high"
	SupportPriorityUrgent = "urgent"
)

const (
	SupportParticipantRequester = "requester"
	SupportParticipantAdmin     = "admin"
	SupportParticipantObserver  = "observer"
)

type SupportTicket struct {
	ID          string       `json:"id"`
	RequesterID string       `json:"requester_id"`
	ScopeType   string       `json:"scope_type"`
	ScopeID     *string      `json:"scope_id,omitempty"`
	Category    string       `json:"category"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Status      string       `json:"status"`
	Priority    string       `json:"priority"`
	AssigneeID  *string      `json:"assignee_id,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	ClosedAt    *time.Time   `json:"closed_at,omitempty"`
	UnreadCount int          `json:"unread_count,omitempty"`
	Unread      *UnreadState `json:"unread,omitempty"`
}

type UnreadState struct {
	Count     int  `json:"count"`
	HasUnread bool `json:"has_unread"`
}

type SupportTicketMessage struct {
	ID           string    `json:"id"`
	TicketID     string    `json:"ticket_id"`
	AuthorID     string    `json:"author_id"`
	Body         string    `json:"body"`
	InternalNote bool      `json:"internal_note"`
	CreatedAt    time.Time `json:"created_at"`
}

type SupportTicketParticipant struct {
	TicketID    string     `json:"ticket_id"`
	UserID      string     `json:"user_id"`
	Role        string     `json:"role"`
	LastReadAt  *time.Time `json:"last_read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UnreadCount int        `json:"unread_count,omitempty"`
}

type SupportTicketEvent struct {
	ID        string         `json:"id"`
	TicketID  string         `json:"ticket_id"`
	ActorID   *string        `json:"actor_id,omitempty"`
	EventType string         `json:"event_type"`
	FromValue *string        `json:"from_value,omitempty"`
	ToValue   *string        `json:"to_value,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

type CreateSupportTicketInput struct {
	ScopeType   string  `json:"scope_type"`
	ScopeID     *string `json:"scope_id,omitempty"`
	Category    string  `json:"category"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Priority    string  `json:"priority,omitempty"`
}

type ListSupportTicketsInput struct {
	ViewerID      string
	RequesterID   *string
	AssigneeID    *string
	ParticipantID *string
	Status        string
	Category      string
	ScopeType     string
	ScopeID       string
	Limit         int
}

type UpdateSupportTicketInput struct {
	Category   *string `json:"category,omitempty"`
	Status     *string `json:"status,omitempty"`
	Priority   *string `json:"priority,omitempty"`
	AssigneeID *string `json:"assignee_id,omitempty"`
}

type AddSupportTicketMessageInput struct {
	Body         string `json:"body"`
	InternalNote bool   `json:"internal_note"`
}

type MarkSupportTicketReadInput struct {
	LastReadAt *time.Time `json:"last_read_at,omitempty"`
}

type SupportTicketDetail struct {
	Ticket       *SupportTicket              `json:"ticket"`
	Messages     []*SupportTicketMessage     `json:"messages"`
	Events       []*SupportTicketEvent       `json:"events"`
	Participants []*SupportTicketParticipant `json:"participants"`
}

func IsValidSupportScopeType(v string) bool {
	switch v {
	case SupportScopePlatform, SupportScopeLeague, SupportScopeClub:
		return true
	default:
		return false
	}
}

func IsValidSupportCategory(v string) bool {
	switch v {
	case SupportCategoryQuestion, SupportCategoryIssue, SupportCategoryFeature:
		return true
	default:
		return false
	}
}

func IsValidSupportStatus(v string) bool {
	switch v {
	case SupportStatusOpen, SupportStatusInProgress, SupportStatusWaitingOnUser, SupportStatusResolved, SupportStatusClosed:
		return true
	default:
		return false
	}
}

func IsValidSupportPriority(v string) bool {
	switch v {
	case SupportPriorityLow, SupportPriorityNormal, SupportPriorityHigh, SupportPriorityUrgent:
		return true
	default:
		return false
	}
}
