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
}
