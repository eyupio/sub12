package model

import "time"

type ScoreCard struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	RifleID       *string   `json:"rifle_id,omitempty"`
	PelletID      *string   `json:"pellet_id,omitempty"`
	ShotAt        string    `json:"shot_at"` // YYYY-MM-DD
	Location      *string   `json:"location,omitempty"`
	WindMPH       *float64  `json:"wind_mph,omitempty"`
	TempCelsius   *float64  `json:"temp_celsius,omitempty"`
	Notes         *string   `json:"notes,omitempty"`
	ShotScores    []int16   `json:"shot_scores"`
	ShotXs        []bool    `json:"shot_xs"`
	TotalScore    int16     `json:"total_score"`
	XCount        int16     `json:"x_count"`
	CardImageURL  *string   `json:"card_image_url,omitempty"`
	Verification  string    `json:"verification"`
	Visibility    string    `json:"visibility"`
	LeagueRoundID *string   `json:"league_round_id,omitempty"`
	ClubID        *string   `json:"club_id,omitempty"`
	LikeCount     int       `json:"like_count"`
	CommentCount  int       `json:"comment_count"`
	IsLiked       bool      `json:"is_liked"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreateScoreCardInput struct {
	RifleID       *string  `json:"rifle_id"`
	PelletID      *string  `json:"pellet_id"`
	ShotAt        string   `json:"shot_at"`
	Location      *string  `json:"location"`
	WindMPH       *float64 `json:"wind_mph"`
	TempCelsius   *float64 `json:"temp_celsius"`
	Notes         *string  `json:"notes"`
	ShotScores    []int16  `json:"shot_scores"`
	ShotXs        []bool   `json:"shot_xs"`
	LeagueRoundID *string  `json:"league_round_id"`
	ClubID        *string  `json:"club_id"`
	Visibility    *string  `json:"visibility"`
}

// UpdateScoreCardInput holds fields a user can change after submission.
type UpdateScoreCardInput struct {
	RifleID     *string  `json:"rifle_id"`
	PelletID    *string  `json:"pellet_id"`
	ShotAt      string   `json:"shot_at"`
	Location    *string  `json:"location"`
	WindMPH     *float64 `json:"wind_mph"`
	TempCelsius *float64 `json:"temp_celsius"`
	Notes       *string  `json:"notes"`
	ShotScores  []int16  `json:"shot_scores"`
	ShotXs      []bool   `json:"shot_xs"`
	Visibility  *string  `json:"visibility"`
}

// Comment is a user comment on any content type (score_card, post, etc.).
type Comment struct {
	ID          string    `json:"id"`
	TargetID    string    `json:"target_id"`
	TargetType  string    `json:"target_type"`
	ParentID    *string   `json:"parent_id,omitempty"`
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	Body        string    `json:"body"`
	LikeCount   int       `json:"like_count"`
	ReplyCount  int       `json:"reply_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateCommentInput struct {
	Body     string  `json:"body"`
	ParentID *string `json:"parent_id,omitempty"`
}

type UpdateCommentInput struct {
	Body string `json:"body"`
}

// ScoreCardSummary is a lighter struct used in list responses.
type ScoreCardSummary struct {
	ID            string    `json:"id"`
	ShotAt        string    `json:"shot_at"`
	TotalScore    int16     `json:"total_score"`
	XCount        int16     `json:"x_count"`
	Location      *string   `json:"location,omitempty"`
	Verification  string    `json:"verification"`
	LeagueRoundID *string   `json:"league_round_id,omitempty"`
	LeagueID      *string   `json:"league_id,omitempty"`
	LeagueName    *string   `json:"league_name,omitempty"`
	ClubID        *string   `json:"club_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// LeagueScore is a score card summary enriched with the submitter's display name,
// used when listing all scores for a league.
type LeagueScore struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	DisplayName  string    `json:"display_name"`
	ShotAt       string    `json:"shot_at"`
	TotalScore   int16     `json:"total_score"`
	XCount       int16     `json:"x_count"`
	Verification string    `json:"verification"`
	CreatedAt    time.Time `json:"created_at"`
}
