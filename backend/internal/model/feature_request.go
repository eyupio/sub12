package model

import "time"

const (
	FeatureRequestStatusSubmitted   = "submitted"
	FeatureRequestStatusRefining    = "refining"
	FeatureRequestStatusAccepted    = "accepted"
	FeatureRequestStatusRejected    = "rejected"
	FeatureRequestStatusPlanned     = "planned"
	FeatureRequestStatusInProgress  = "in_progress"
	FeatureRequestStatusDone        = "done"
	FeatureRequestStatusImplemented = "implemented"
)

const (
	FeatureRequestPriorityLow    = "low"
	FeatureRequestPriorityNormal = "normal"
	FeatureRequestPriorityHigh   = "high"
	FeatureRequestPriorityUrgent = "urgent"
)

const (
	FeatureRequestEventCreated         = "created"
	FeatureRequestEventStatusChanged   = "status_changed"
	FeatureRequestEventPriorityChanged = "priority_changed"
	FeatureRequestEventOwnerChanged    = "owner_changed"
)

type FeatureRequest struct {
	ID                 string    `json:"id"`
	TicketID           string    `json:"ticket_id"`
	Title              string    `json:"title"`
	RefinedDescription string    `json:"refined_description"`
	Status             string    `json:"status"`
	Priority           string    `json:"priority"`
	OwnerAdminID       *string   `json:"owner_admin_id,omitempty"`
	OwnerAdminName     *string   `json:"owner_admin_name,omitempty"`
	RequesterID        string    `json:"requester_id"`
	RequesterName      string    `json:"requester_name"`
	ScopeType          string    `json:"scope_type"`
	ScopeID            *string   `json:"scope_id,omitempty"`
	ScopeName          *string   `json:"scope_name,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	VoteCount          int       `json:"vote_count"`
	CommentCount       int       `json:"comment_count"`
	ViewerHasVoted     bool      `json:"viewer_has_voted"`
}

// FeatureRequestEvent is one entry in a request's history — how it entered the
// board and every state change since.
type FeatureRequestEvent struct {
	ID               string    `json:"id"`
	FeatureRequestID string    `json:"feature_request_id"`
	ActorID          *string   `json:"actor_id,omitempty"`
	ActorName        *string   `json:"actor_name,omitempty"`
	EventType        string    `json:"event_type"`
	FromValue        *string   `json:"from_value,omitempty"`
	ToValue          *string   `json:"to_value,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

type CreateFeatureRequestFromTicketInput struct {
	Title              string  `json:"title"`
	RefinedDescription string  `json:"refined_description"`
	OwnerAdminID       *string `json:"owner_admin_id,omitempty"`
}

type UpdateFeatureRequestInput struct {
	Title              *string `json:"title,omitempty"`
	RefinedDescription *string `json:"refined_description,omitempty"`
	Status             *string `json:"status,omitempty"`
	Priority           *string `json:"priority,omitempty"`
	OwnerAdminID       *string `json:"owner_admin_id,omitempty"`
}

type ListFeatureRequestsInput struct {
	ViewerID  string
	ScopeType string `json:"scope_type,omitempty"`
	ScopeID   string `json:"scope_id,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

func IsValidFeatureRequestStatus(v string) bool {
	switch v {
	case FeatureRequestStatusSubmitted,
		FeatureRequestStatusRefining,
		FeatureRequestStatusAccepted,
		FeatureRequestStatusRejected,
		FeatureRequestStatusPlanned,
		FeatureRequestStatusInProgress,
		FeatureRequestStatusDone,
		FeatureRequestStatusImplemented:
		return true
	default:
		return false
	}
}

func IsValidFeatureRequestPriority(v string) bool {
	switch v {
	case FeatureRequestPriorityLow,
		FeatureRequestPriorityNormal,
		FeatureRequestPriorityHigh,
		FeatureRequestPriorityUrgent:
		return true
	default:
		return false
	}
}
