package model

import "time"

type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	PasswordHash *string    `json:"-"`
	DisplayName  string     `json:"display_name"`
	Bio          *string    `json:"bio,omitempty"`
	Location     *string    `json:"location,omitempty"`
	Club         *string    `json:"club,omitempty"`
	AvatarURL    *string    `json:"avatar_url,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// PublicProfile is the subset safe to expose to other users.
type PublicProfile struct {
	ID          string    `json:"id"`
	DisplayName string    `json:"display_name"`
	Bio         *string   `json:"bio,omitempty"`
	Location    *string   `json:"location,omitempty"`
	Club        *string   `json:"club,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
