package model

import "time"

// Post visibility constants mirror the CHECK on posts.visibility.
const (
	PostVisibilityInherit   = "inherit"
	PostVisibilityPublic    = "public"
	PostVisibilityFollowers = "followers"
	PostVisibilityMembers   = "members"
	PostVisibilityPrivate   = "private"
)

type Post struct {
	ID           string           `json:"id"`
	UserID       string           `json:"user_id"`
	DisplayName  string           `json:"display_name"`
	AvatarURL    *string          `json:"avatar_url,omitempty"`
	Body         string           `json:"body"`
	LeagueID     *string          `json:"league_id,omitempty"`
	ClubID       *string          `json:"club_id,omitempty"`
	Visibility   string           `json:"visibility"`
	HiddenAt     *time.Time       `json:"hidden_at,omitempty"`
	LikeCount    int              `json:"like_count"`
	CommentCount int              `json:"comment_count"`
	IsLiked      bool             `json:"is_liked"`
	IsFlagged    bool             `json:"is_flagged,omitempty"`
	FlagReason   *string          `json:"flag_reason,omitempty"`
	Attachments  []PostAttachment `json:"attachments"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

type PostAttachment struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"` // image, score_card, pellet_test
	TargetID  *string `json:"target_id,omitempty"`
	ImageURL  *string `json:"image_url,omitempty"`
	SortOrder int16   `json:"sort_order"`
}

type CreatePostInput struct {
	Body        string                  `json:"body"`
	LeagueID    *string                 `json:"league_id,omitempty"`
	ClubID      *string                 `json:"club_id,omitempty"`
	Visibility  string                  `json:"visibility,omitempty"`
	Attachments []CreateAttachmentInput `json:"attachments,omitempty"`
}

type CreateAttachmentInput struct {
	Type     string  `json:"type"`
	TargetID *string `json:"target_id,omitempty"`
	ImageURL *string `json:"image_url,omitempty"`
}

type ShareInput struct {
	TargetID   string  `json:"target_id"`
	TargetType string  `json:"target_type"` // score_card, pellet_test
	Body       string  `json:"body"`
	LeagueID   *string `json:"league_id,omitempty"`
	ClubID     *string `json:"club_id,omitempty"`
	Visibility string  `json:"visibility,omitempty"`
}

// IsValidPostVisibility returns true if v is one of the allowed visibility values.
func IsValidPostVisibility(v string) bool {
	switch v {
	case PostVisibilityInherit, PostVisibilityPublic, PostVisibilityFollowers, PostVisibilityMembers, PostVisibilityPrivate:
		return true
	}
	return false
}
