package model

import "time"

// Follow represents a single follower → following relationship.
type Follow struct {
	FollowerID  string    `json:"follower_id"`
	FollowingID string    `json:"following_id"`
	CreatedAt   time.Time `json:"created_at"`
}

// FollowStats is social context attached to a public profile response.
type FollowStats struct {
	FollowerCount  int  `json:"follower_count"`
	FollowingCount int  `json:"following_count"`
	IsFollowing    bool `json:"is_following"` // true when the requesting user follows this profile
}

// PublicProfileWithFollow extends PublicProfile with social context.
// Returned by GET /api/v1/users/{id} for authenticated requests.
type PublicProfileWithFollow struct {
	PublicProfile
	FollowStats
	IsPrivate          bool   `json:"is_private"`
	IsBlocked          bool   `json:"is_blocked"`
	FollowRequestStatus string `json:"follow_request_status,omitempty"` // "", "pending", "accepted"
}

// UserBlock represents a block relationship.
type UserBlock struct {
	BlockerID   string    `json:"blocker_id"`
	BlockedID   string    `json:"blocked_id"`
	DisplayName string    `json:"display_name,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// FollowRequest represents a pending follow request for a private profile.
type FollowRequest struct {
	ID          string    `json:"id"`
	RequesterID string    `json:"requester_id"`
	TargetID    string    `json:"target_id"`
	Status      string    `json:"status"`
	DisplayName string    `json:"display_name,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	DecidedAt   *time.Time `json:"decided_at,omitempty"`
}

// FollowListItem is a lightweight user summary for follower/following lists.
type FollowListItem struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}
