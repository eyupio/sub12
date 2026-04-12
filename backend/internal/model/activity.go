package model

import (
	"encoding/json"
	"time"
)

// ActivityType is the event type stored in the activities table.
type ActivityType = string

const (
	ActivityScorePosted  ActivityType = "score_posted"
	ActivityPersonalBest ActivityType = "personal_best"
	ActivityJoinedLeague ActivityType = "joined_league"
	ActivityCommented    ActivityType = "commented"
)

// Activity is a single event in the social feed.
type Activity struct {
	ID          string          `json:"id"`
	UserID      string          `json:"user_id"`
	DisplayName string          `json:"display_name"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	Type        ActivityType    `json:"type"`
	TargetID    *string         `json:"target_id,omitempty"`
	TargetType  *string         `json:"target_type,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// ScorePostedMeta is the JSONB metadata for ActivityScorePosted / ActivityPersonalBest events.
type ScorePostedMeta struct {
	TotalScore  int16  `json:"total_score"`
	XCount      int16  `json:"x_count"`
	IsPB        bool   `json:"is_pb,omitempty"`
	LeagueName  string `json:"league_name,omitempty"`
}

// FeedResponse is the paginated response for GET /api/v1/feed.
type FeedResponse struct {
	Items  []*Activity `json:"items"`
	Cursor string      `json:"cursor,omitempty"` // ISO8601 timestamp of the last item for the next page
}
