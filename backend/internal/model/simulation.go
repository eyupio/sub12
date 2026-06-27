package model

import "time"

// SimulationSettings is the admin-controlled configuration for the activity
// simulation engine. It is stored as a single row (id = 1).
type SimulationSettings struct {
	ID                    int16      `json:"id"`
	Enabled               bool       `json:"enabled"`
	PersonaCount          int        `json:"persona_count"`
	ActionsPerHour        int        `json:"actions_per_hour"`
	PostWeight            int        `json:"post_weight"`
	LikeWeight            int        `json:"like_weight"`
	CommentWeight         int        `json:"comment_weight"`
	FollowWeight          int        `json:"follow_weight"`
	ActiveStartHour       int        `json:"active_start_hour"`
	ActiveEndHour         int        `json:"active_end_hour"`
	InteractWithRealUsers bool       `json:"interact_with_real_users"`
	MaxCardsPerPersona    int        `json:"max_cards_per_persona"`
	LastRunAt             *time.Time `json:"last_run_at,omitempty"`
	LastAction            *string    `json:"last_action,omitempty"`
	UpdatedBy             *string    `json:"updated_by,omitempty"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// UpsertSimulationSettingsInput carries the admin-editable fields.
type UpsertSimulationSettingsInput struct {
	Enabled               bool `json:"enabled"`
	PersonaCount          int  `json:"persona_count"`
	ActionsPerHour        int  `json:"actions_per_hour"`
	PostWeight            int  `json:"post_weight"`
	LikeWeight            int  `json:"like_weight"`
	CommentWeight         int  `json:"comment_weight"`
	FollowWeight          int  `json:"follow_weight"`
	ActiveStartHour       int  `json:"active_start_hour"`
	ActiveEndHour         int  `json:"active_end_hour"`
	InteractWithRealUsers bool `json:"interact_with_real_users"`
	MaxCardsPerPersona    int  `json:"max_cards_per_persona"`
}

// SimulationStatus is a read-only snapshot of the simulation's live state,
// surfaced to admins so they can see how many simulated accounts exist and what
// the engine last did.
type SimulationStatus struct {
	Enabled            bool       `json:"enabled"`
	PersonaCount       int        `json:"persona_count"`
	SimulatedUserCount int        `json:"simulated_user_count"`
	SimulatedCardCount int        `json:"simulated_card_count"`
	LastRunAt          *time.Time `json:"last_run_at,omitempty"`
	LastAction         *string    `json:"last_action,omitempty"`
}
