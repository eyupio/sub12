package model

import "time"

type User struct {
	ID                     string     `json:"id"`
	Email                  string     `json:"email"`
	PasswordHash           *string    `json:"-"`
	Role                   string     `json:"role"`
	DisplayName            string     `json:"display_name"`
	Bio                    *string    `json:"bio,omitempty"`
	Location               *string    `json:"location,omitempty"`
	Club                   *string    `json:"club,omitempty"`
	AvatarURL              *string    `json:"avatar_url,omitempty"`
	ProfileVisibility      string     `json:"profile_visibility"`
	DefaultScoreVisibility string     `json:"default_score_visibility"`
	FeedOptOut             bool       `json:"feed_opt_out"`
	ShowFollowerCounts     bool       `json:"show_follower_counts"`
	StarLevel              int        `json:"star_level"`
	DefaultDistanceUnit    string     `json:"default_distance_unit"`
	DefaultMeasurementUnit string     `json:"default_measurement_unit"`
	DateFormat             string     `json:"date_format"`
	TimeFormat             string     `json:"time_format"`
	Timezone               string     `json:"timezone"`
	TOTPSecret             *string    `json:"-"`
	TOTPEnabled            bool       `json:"totp_enabled"`
	TOTPEnrolledAt         *time.Time `json:"totp_enrolled_at,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

// PublicProfile is the subset safe to expose to other users.
type PublicProfile struct {
	ID                 string    `json:"id"`
	DisplayName        string    `json:"display_name"`
	Bio                *string   `json:"bio,omitempty"`
	Location           *string   `json:"location,omitempty"`
	Club               *string   `json:"club,omitempty"`
	AvatarURL          *string   `json:"avatar_url,omitempty"`
	ProfileVisibility  string    `json:"profile_visibility"`
	ShowFollowerCounts bool      `json:"show_follower_counts"`
	StarLevel          int       `json:"star_level"`
	IsSimulated        bool      `json:"is_simulated"`
	CreatedAt          time.Time `json:"created_at"`
}

// UpdateProfileInput holds the fields a user can change on their own profile.
type UpdateProfileInput struct {
	DisplayName            *string `json:"display_name"`
	Bio                    *string `json:"bio"`
	Location               *string `json:"location"`
	Club                   *string `json:"club"`
	ProfileVisibility      *string `json:"profile_visibility"`
	DefaultScoreVisibility *string `json:"default_score_visibility"`
	FeedOptOut             *bool   `json:"feed_opt_out"`
	ShowFollowerCounts     *bool   `json:"show_follower_counts"`
	DefaultDistanceUnit    *string `json:"default_distance_unit"`
	DefaultMeasurementUnit *string `json:"default_measurement_unit"`
	DateFormat             *string `json:"date_format"`
	TimeFormat             *string `json:"time_format"`
	Timezone               *string `json:"timezone"`
}
