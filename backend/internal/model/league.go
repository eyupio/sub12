package model

import "time"

type League struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Type        string    `json:"type"`
	CreatedBy   string    `json:"created_by"`
	MemberCount int       `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateLeagueInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type LeagueStanding struct {
	Rank        int       `json:"rank"`
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	BestScore   *int16    `json:"best_score"`
	BestX       *int16    `json:"best_x"`
	CardCount   int       `json:"card_count"`
	JoinedAt    time.Time `json:"joined_at"`
}
