package model

import "time"

// AdminUser is the user row as visible to a platform admin.
// Unlike PublicProfile it includes email and role; unlike User it omits password_hash.
type AdminUser struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	DisplayName string    `json:"display_name"`
	Bio         *string   `json:"bio,omitempty"`
	Location    *string   `json:"location,omitempty"`
	Club        *string   `json:"club,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpdateLeagueInput holds fields that a platform admin may change on any league.
type UpdateLeagueInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// UpdateClubInput holds fields that a platform admin may change on any club.
type UpdateClubInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}
