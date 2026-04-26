package model

import "time"

type Location struct {
	ID                  string    `json:"id"`
	UserID              string    `json:"user_id"`
	Name                string    `json:"name"`
	Address             *string   `json:"address,omitempty"`
	Lat                 *float64  `json:"lat,omitempty"`
	Lng                 *float64  `json:"lng,omitempty"`
	DefaultDistanceM    *int      `json:"default_distance_m,omitempty"`
	DefaultDistanceUnit *string   `json:"default_distance_unit,omitempty"`
	DefaultTargetPreset *string   `json:"default_target_preset,omitempty"`
	Notes               *string   `json:"notes,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type CreateLocationInput struct {
	Name                string   `json:"name"`
	Address             *string  `json:"address"`
	Lat                 *float64 `json:"lat"`
	Lng                 *float64 `json:"lng"`
	DefaultDistanceM    *int     `json:"default_distance_m"`
	DefaultDistanceUnit *string  `json:"default_distance_unit"`
	DefaultTargetPreset *string  `json:"default_target_preset"`
	Notes               *string  `json:"notes"`
}

type UpdateLocationInput struct {
	Name                *string  `json:"name"`
	Address             *string  `json:"address"`
	Lat                 *float64 `json:"lat"`
	Lng                 *float64 `json:"lng"`
	DefaultDistanceM    *int     `json:"default_distance_m"`
	DefaultDistanceUnit *string  `json:"default_distance_unit"`
	DefaultTargetPreset *string  `json:"default_target_preset"`
	Notes               *string  `json:"notes"`
}
