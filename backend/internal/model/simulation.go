package model

import "time"

// SimulationSettings is the admin-controlled configuration for the activity
// simulation engine. It is stored as a single row (id = 1).
type SimulationSettings struct {
	ID                    int16     `json:"id"`
	Enabled               bool      `json:"enabled"`
	PersonaCount          int       `json:"persona_count"`
	ActionsPerHour        int       `json:"actions_per_hour"`
	PostWeight            int       `json:"post_weight"`
	LikeWeight            int       `json:"like_weight"`
	CommentWeight         int       `json:"comment_weight"`
	FollowWeight          int       `json:"follow_weight"`
	UnfollowWeight        int       `json:"unfollow_weight"`
	ShareWeight           int       `json:"share_weight"`
	ActiveStartHour       int       `json:"active_start_hour"`
	ActiveEndHour         int       `json:"active_end_hour"`
	InteractWithRealUsers bool      `json:"interact_with_real_users"`
	MaxCardsPerPersona    int       `json:"max_cards_per_persona"`
	HourlyMultipliers     []float64 `json:"hourly_multipliers"`
	IncludeInPublicStats  bool      `json:"include_in_public_stats"`

	// Realism controls. These shape how human the simulated community reads
	// rather than how much of it there is.
	BackdateDays       int `json:"backdate_days"`        // how far back a logged session can be dated
	WeekendBias        int `json:"weekend_bias"`         // 0-100: pull of weekday sessions onto the weekend
	AwayDayChance      int `json:"away_day_chance"`      // 0-100: how often a persona shoots away from home
	ReplyChance        int `json:"reply_chance"`         // 0-100: base chance a comment joins a thread
	SessionActions     int `json:"session_actions"`      // max consecutive actions one persona takes per visit
	PersonaHistoryDays int `json:"persona_history_days"` // spread of join dates for new personas

	LastRunAt  *time.Time `json:"last_run_at,omitempty"`
	LastAction *string    `json:"last_action,omitempty"`
	LastTickAt *time.Time `json:"last_tick_at,omitempty"`
	UpdatedBy  *string    `json:"updated_by,omitempty"`
	UpdatedAt  time.Time  `json:"updated_at"`

	// Cumulative counters and last-error tracking, surfaced in the admin
	// status snapshot so operators can see what the engine has done.
	TotalActions  int        `json:"total_actions"`
	PostCount     int        `json:"post_count"`
	LikeCount     int        `json:"like_count"`
	CommentCount  int        `json:"comment_count"`
	FollowCount   int        `json:"follow_count"`
	UnfollowCount int        `json:"unfollow_count"`
	ShareCount    int        `json:"share_count"`
	LastError     *string    `json:"last_error,omitempty"`
	LastErrorAt   *time.Time `json:"last_error_at,omitempty"`
}

// UpsertSimulationSettingsInput carries the admin-editable fields.
type UpsertSimulationSettingsInput struct {
	Enabled               bool      `json:"enabled"`
	PersonaCount          int       `json:"persona_count"`
	ActionsPerHour        int       `json:"actions_per_hour"`
	PostWeight            int       `json:"post_weight"`
	LikeWeight            int       `json:"like_weight"`
	CommentWeight         int       `json:"comment_weight"`
	FollowWeight          int       `json:"follow_weight"`
	UnfollowWeight        int       `json:"unfollow_weight"`
	ShareWeight           int       `json:"share_weight"`
	ActiveStartHour       int       `json:"active_start_hour"`
	ActiveEndHour         int       `json:"active_end_hour"`
	InteractWithRealUsers bool      `json:"interact_with_real_users"`
	MaxCardsPerPersona    int       `json:"max_cards_per_persona"`
	HourlyMultipliers     []float64 `json:"hourly_multipliers"`
	IncludeInPublicStats  bool      `json:"include_in_public_stats"`

	BackdateDays       int `json:"backdate_days"`
	WeekendBias        int `json:"weekend_bias"`
	AwayDayChance      int `json:"away_day_chance"`
	ReplyChance        int `json:"reply_chance"`
	SessionActions     int `json:"session_actions"`
	PersonaHistoryDays int `json:"persona_history_days"`
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
	LastTickAt         *time.Time `json:"last_tick_at,omitempty"`

	// Cumulative counters and last error.
	TotalActions  int        `json:"total_actions"`
	PostCount     int        `json:"post_count"`
	LikeCount     int        `json:"like_count"`
	CommentCount  int        `json:"comment_count"`
	FollowCount   int        `json:"follow_count"`
	UnfollowCount int        `json:"unfollow_count"`
	ShareCount    int        `json:"share_count"`
	LastError     *string    `json:"last_error,omitempty"`
	LastErrorAt   *time.Time `json:"last_error_at,omitempty"`
}

// SimulatedPersona is a single simulated account row surfaced to admins.
type SimulatedPersona struct {
	ID          string    `json:"id"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	Bio         *string   `json:"bio,omitempty"`
	Location    *string   `json:"location,omitempty"`
	Club        *string   `json:"club,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CardCount   int       `json:"card_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// SimulationAudit is a single admin-operation audit entry.
type SimulationAudit struct {
	ID        int64     `json:"id"`
	Event     string    `json:"event"`
	ActorID   *string   `json:"actor_id,omitempty"`
	Detail    *string   `json:"detail,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// UpdateSimulatedPersonaInput carries the admin-editable profile fields for a
// simulated account. All fields are optional (partial update).
type UpdateSimulatedPersonaInput struct {
	DisplayName *string `json:"display_name"`
	Bio         *string `json:"bio"`
	Location    *string `json:"location"`
	Club        *string `json:"club"`
}
