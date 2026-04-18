package model

import "time"

// ClubSummary is the minimal public-facing view of a club used to render a
// "members-only" banner without leaking members, standings or posts.
type ClubSummary struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    *string `json:"description,omitempty"`
	ImageURL       *string `json:"image_url,omitempty"`
	Type           string  `json:"type"`
	JoinPolicy     string  `json:"join_policy"`
	PostVisibility string  `json:"post_visibility"`
	MemberCount    int     `json:"member_count"`
}

type Club struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    *string `json:"description,omitempty"`
	ImageURL       *string `json:"image_url,omitempty"`
	JoinCode       string  `json:"join_code"`
	Type           string  `json:"type"`
	JoinPolicy     string  `json:"join_policy"`
	PostVisibility string  `json:"post_visibility"`
	DateFormat     string  `json:"date_format"`
	TimeFormat     string  `json:"time_format"`
	Timezone       string  `json:"timezone"`
	CreatedBy      string  `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
	MemberCount    int     `json:"member_count"`
	IsAdmin        bool    `json:"is_admin,omitempty"`
	IsMember       bool    `json:"is_member,omitempty"`
}

type ClubMember struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	IsAdmin     bool    `json:"is_admin"`
	JoinedAt    string  `json:"joined_at"`
}

type ClubStanding struct {
	Rank        int     `json:"rank"`
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	BestScore   *int16  `json:"best_score,omitempty"`
	BestX       *int16  `json:"best_x,omitempty"`
	CardCount   int     `json:"card_count"`
}

type CreateClubInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Type        *string `json:"type,omitempty"`        // "public" or "private" (defaults to "public")
	JoinPolicy  *string `json:"join_policy,omitempty"` // "open", "invite_code", or "approval" (defaults to "open")
}

type UpdateClubMemberInput struct {
	IsAdmin *bool `json:"is_admin"`
}

type ClubJoinRequest struct {
	ID          string     `json:"id"`
	ClubID      string     `json:"club_id"`
	UserID      string     `json:"user_id"`
	DisplayName string     `json:"display_name,omitempty"`
	AvatarURL   *string    `json:"avatar_url,omitempty"`
	Status      string     `json:"status"`
	DecidedBy   *string    `json:"decided_by,omitempty"`
	DecidedAt   *time.Time `json:"decided_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
