package model

import "time"

const (
	ReportTargetPost      = "post"
	ReportTargetComment   = "comment"
	ReportTargetUser      = "user"
	ReportTargetScoreCard = "score_card"
	ReportTargetActivity  = "activity"
)

const (
	ReportStatusOpen      = "open"
	ReportStatusDismissed = "dismissed"
	ReportStatusActioned  = "actioned"
)

const (
	ModerationActionHide     = "hide"
	ModerationActionWarn     = "warn_user"
	ModerationActionNoAction = "no_action"
)

// Report is a user-submitted flag of content or another user.
type Report struct {
	ID         string     `json:"id"`
	ReporterID string     `json:"reporter_id"`
	TargetType string     `json:"target_type"`
	TargetID   string     `json:"target_id"`
	Reason     string     `json:"reason"`
	Notes      *string    `json:"notes,omitempty"`
	Status     string     `json:"status"`
	LeagueID   *string    `json:"league_id,omitempty"`
	ClubID     *string    `json:"club_id,omitempty"`
	DecidedBy  *string    `json:"decided_by,omitempty"`
	DecidedAt  *time.Time `json:"decided_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// CreateReportInput is the user-facing payload for POST /reports.
// ContextLeagueID / ContextClubID are optional hints the client can send
// when flagging a user target from inside a league/club surface; they are
// ignored for content targets where scope is derived from the target itself.
type CreateReportInput struct {
	TargetType      string  `json:"target_type"`
	TargetID        string  `json:"target_id"`
	Reason          string  `json:"reason"`
	Notes           *string `json:"notes,omitempty"`
	ContextLeagueID *string `json:"context_league_id,omitempty"`
	ContextClubID   *string `json:"context_club_id,omitempty"`
}

// DecideReportInput is the admin decision payload.
type DecideReportInput struct {
	Action string  `json:"action"`
	Notes  *string `json:"notes,omitempty"`
}

// IsValidReportTarget returns true for supported target_type values.
func IsValidReportTarget(t string) bool {
	switch t {
	case ReportTargetPost, ReportTargetComment, ReportTargetUser, ReportTargetScoreCard, ReportTargetActivity:
		return true
	}
	return false
}

// IsValidModerationAction returns true for supported admin actions.
func IsValidModerationAction(a string) bool {
	switch a {
	case ModerationActionHide, ModerationActionWarn, ModerationActionNoAction:
		return true
	}
	return false
}
