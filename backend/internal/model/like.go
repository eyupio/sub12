package model

import "time"

// Target type constants for the polymorphic likes table.
const (
	LikeTargetScoreCard = "score_card"
	LikeTargetPost      = "post"
	LikeTargetComment   = "comment"
	LikeTargetActivity  = "activity"
)

// Like represents a single like on a target entity.
type Like struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	TargetID   string    `json:"target_id"`
	TargetType string    `json:"target_type"`
	CreatedAt  time.Time `json:"created_at"`
}
