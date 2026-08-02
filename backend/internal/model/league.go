package model

import "time"

type League struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Slug is the human-readable identifier used in public share URLs.
	Slug           string    `json:"slug"`
	Description    *string   `json:"description,omitempty"`
	Type           string    `json:"type"`
	PostVisibility string    `json:"post_visibility"`
	JoinCode       *string   `json:"join_code,omitempty"`
	ImageURL       *string   `json:"image_url,omitempty"`
	ClubID         *string   `json:"club_id,omitempty"`
	CreatedBy      string    `json:"created_by"`
	MemberCount    int       `json:"member_count"`
	DateFormat     string    `json:"date_format"`
	TimeFormat     string    `json:"time_format"`
	Timezone       string    `json:"timezone"`
	CreatedAt      time.Time `json:"created_at"`
}

// LeagueSummary is the minimal public-facing view of a league used to render a
// "members-only" banner without leaking members, standings or posts.
type LeagueSummary struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    *string `json:"description,omitempty"`
	ImageURL       *string `json:"image_url,omitempty"`
	Type           string  `json:"type"`
	JoinPolicy     string  `json:"join_policy"`
	PostVisibility string  `json:"post_visibility"`
	MemberCount    int     `json:"member_count"`
	ClubID         *string `json:"club_id,omitempty"`
}

type CreateLeagueInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Type        string  `json:"type"`         // "public" or "private"; defaults to "public"
	ClubID      *string `json:"club_id"`      // optional: host this league under a club
	ScoringRule *string `json:"scoring_rule"` // optional: "highest" or "average"; defaults to "highest"
	JoinPolicy  *string `json:"join_policy"`  // optional: "open", "invite_code", or "approval"; defaults to "open"
}

// UpdateLeagueBasicsInput captures owner-editable fields on the league record.
type UpdateLeagueBasicsInput struct {
	Name           *string `json:"name"`
	Description    *string `json:"description"`
	Type           *string `json:"type"`
	PostVisibility *string `json:"post_visibility"`
	DateFormat     *string `json:"date_format"`
	TimeFormat     *string `json:"time_format"`
	Timezone       *string `json:"timezone"`
}

type LeagueStanding struct {
	Rank        int       `json:"rank"`
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	BestScore   *float64  `json:"best_score"`
	BestX       *int16    `json:"best_x"`
	CardCount   int       `json:"card_count"`
	JoinedAt    time.Time `json:"joined_at"`
}

// LeagueConfig holds all configurable settings for a league.
type LeagueConfig struct {
	LeagueID                   string    `json:"league_id"`
	StartsOn                   *string   `json:"starts_on,omitempty"`
	EndsOn                     *string   `json:"ends_on,omitempty"`
	MaxSubmissionsPerRound     int16     `json:"max_submissions_per_round"`
	ScoringRule                string    `json:"scoring_rule"`
	JoinPolicy                 string    `json:"join_policy"`
	RequireScoreVerification   bool      `json:"require_score_verification"`
	RequiredConfirmations      int16     `json:"required_confirmations"`
	RequireImageUpload         bool      `json:"require_image_upload"`
	LockEditsAfterVerification bool      `json:"lock_edits_after_verification"`
	UpdatedAt                  time.Time `json:"updated_at"`
}

type UpdateLeagueConfigInput struct {
	StartsOn                   *string `json:"starts_on"`
	EndsOn                     *string `json:"ends_on"`
	MaxSubmissionsPerRound     *int16  `json:"max_submissions_per_round"`
	ScoringRule                *string `json:"scoring_rule"`
	JoinPolicy                 *string `json:"join_policy"`
	RequireScoreVerification   *bool   `json:"require_score_verification"`
	RequiredConfirmations      *int16  `json:"required_confirmations"`
	RequireImageUpload         *bool   `json:"require_image_upload"`
	LockEditsAfterVerification *bool   `json:"lock_edits_after_verification"`
}

type Season struct {
	ID        string    `json:"id"`
	LeagueID  string    `json:"league_id"`
	Name      string    `json:"name"`
	StartsOn  string    `json:"starts_on"`
	EndsOn    *string   `json:"ends_on,omitempty"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateSeasonInput struct {
	Name     string  `json:"name"`
	StartsOn string  `json:"starts_on"`
	EndsOn   *string `json:"ends_on"`
}

// UpdateSeasonInput follows the "omit to keep, empty string to clear"
// convention. StartsOn and Name are NOT NULL, so an empty string is refused
// there rather than treated as a clear. IsActive is the archive switch: an
// archived season keeps its history and standings but no longer takes new
// cards.
type UpdateSeasonInput struct {
	Name     *string `json:"name"`
	StartsOn *string `json:"starts_on"`
	EndsOn   *string `json:"ends_on"`
	IsActive *bool   `json:"is_active"`
}

type Round struct {
	ID        string    `json:"id"`
	SeasonID  string    `json:"season_id"`
	Name      string    `json:"name"`
	OpensAt   *string   `json:"opens_at,omitempty"`
	ClosesAt  *string   `json:"closes_at,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateRoundInput struct {
	Name     string  `json:"name"`
	OpensAt  *string `json:"opens_at"`
	ClosesAt *string `json:"closes_at"`
}

// UpdateRoundInput follows the same convention as UpdateSeasonInput: omit a
// field to keep it, send an empty string to clear it. Clearing both dates is
// how a round is made permanently open again.
type UpdateRoundInput struct {
	Name     *string `json:"name"`
	OpensAt  *string `json:"opens_at"`
	ClosesAt *string `json:"closes_at"`
}

// ActiveRound identifies the round new submissions land in, named so the UI can
// tell the shooter where their card is going.
type ActiveRound struct {
	ID         string `json:"round_id"`
	Name       string `json:"round_name"`
	SeasonName string `json:"season_name"`
}

// ReopenScoreInput carries the optional note recorded when an admin returns a
// rejected card to the review queue.
type ReopenScoreInput struct {
	Reason *string `json:"reason"`
}

type JoinRequest struct {
	ID          string     `json:"id"`
	LeagueID    string     `json:"league_id"`
	UserID      string     `json:"user_id"`
	DisplayName string     `json:"display_name,omitempty"`
	Status      string     `json:"status"`
	DecidedBy   *string    `json:"decided_by,omitempty"`
	DecidedAt   *time.Time `json:"decided_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type ScoreConfirmation struct {
	ID          string    `json:"id"`
	ScoreCardID string    `json:"score_card_id"`
	ConfirmedBy string    `json:"confirmed_by"`
	DisplayName string    `json:"display_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type ScoreCardAction struct {
	ID            string    `json:"id"`
	ScoreCardID   string    `json:"score_card_id"`
	Action        string    `json:"action"`
	PerformedBy   string    `json:"performed_by"`
	DisplayName   string    `json:"display_name,omitempty"`
	Reason        *string   `json:"reason,omitempty"`
	OldTotalScore *int16    `json:"old_total_score,omitempty"`
	NewTotalScore *int16    `json:"new_total_score,omitempty"`
	OldXCount     *int16    `json:"old_x_count,omitempty"`
	NewXCount     *int16    `json:"new_x_count,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type AmendScoreInput struct {
	NewTotalScore int16   `json:"new_total_score"`
	NewXCount     int16   `json:"new_x_count"`
	Reason        *string `json:"reason"`
}

type RejectScoreInput struct {
	Reason string `json:"reason"`
}

// VerifyScoreInput carries the optional note recorded when an admin explicitly
// verifies a pending card.
type VerifyScoreInput struct {
	Reason *string `json:"reason"`
}

type LeagueMember struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	// IsAdmin is the pre-moderator spelling of IsModerator, still emitted so
	// an app running an older bundle keeps rendering the badge.
	IsAdmin     bool      `json:"is_admin"`
	IsModerator bool      `json:"is_moderator"`
	IsOwner     bool      `json:"is_owner"`
	Permissions []string  `json:"permissions"`
	JoinedAt    time.Time `json:"joined_at"`
}

// UpdateLeagueMemberInput carries a member role change: promote/demote via
// IsModerator (IsAdmin is the accepted legacy spelling), and the delegated
// capability grant via Permissions.
type UpdateLeagueMemberInput struct {
	IsAdmin     *bool     `json:"is_admin"`
	IsModerator *bool     `json:"is_moderator"`
	Permissions *[]string `json:"permissions"`
}

// Moderator resolves the promote/demote intent from either spelling.
func (in *UpdateLeagueMemberInput) Moderator() *bool {
	if in.IsModerator != nil {
		return in.IsModerator
	}
	return in.IsAdmin
}

// LeagueScoreCounts is the per-status tally of submitted cards in a league.
type LeagueScoreCounts struct {
	All      int `json:"all"`
	Pending  int `json:"pending"`
	Verified int `json:"verified"`
	Rejected int `json:"rejected"`
}

// ScoreCardLeague is a lightweight league reference resolved from a score card.
type ScoreCardLeague struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	RoundID   *string `json:"round_id,omitempty"`
	RoundName *string `json:"round_name,omitempty"`
}

type MyLeagueSummary struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
	MemberCount int     `json:"member_count"`
	UserRank    int     `json:"user_rank"`
	StartsOn    *string `json:"starts_on,omitempty"`
	EndsOn      *string `json:"ends_on,omitempty"`
}
