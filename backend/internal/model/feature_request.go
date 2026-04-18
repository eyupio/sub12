package model

import "time"

const (
	FeatureRequestStatusSubmitted  = "submitted"
	FeatureRequestStatusRefining   = "refining"
	FeatureRequestStatusAccepted   = "accepted"
	FeatureRequestStatusRejected   = "rejected"
	FeatureRequestStatusPlanned    = "planned"
	FeatureRequestStatusInProgress = "in_progress"
	FeatureRequestStatusDone       = "done"
)

type FeatureRequest struct {
	ID                 string    `json:"id"`
	TicketID           string    `json:"ticket_id"`
	Title              string    `json:"title"`
	RefinedDescription string    `json:"refined_description"`
	Status             string    `json:"status"`
	OwnerAdminID       *string   `json:"owner_admin_id,omitempty"`
	ScopeType          string    `json:"scope_type"`
	ScopeID            *string   `json:"scope_id,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	VoteCount          int       `json:"vote_count"`
	ViewerHasVoted     bool      `json:"viewer_has_voted"`
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
		FeatureRequestStatusDone:
		return true
	default:
		return false
	}
}
