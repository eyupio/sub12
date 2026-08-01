package model

import "time"

type Rifle struct {
	ID        string   `json:"id"`
	UserID    string   `json:"user_id"`
	Make      string   `json:"make"`
	Model     string   `json:"model"`
	Calibre   string   `json:"calibre"`
	PowerFtLb *float64 `json:"power_ftlb,omitempty"`
	TuneNotes *string  `json:"tune_notes,omitempty"`
	ImageURL  *string  `json:"image_url,omitempty"`
	IsActive  bool     `json:"is_active"`
	// ComparisonOptIn controls whether this rifle's scores feed the
	// cross-user showcase aggregates for its make/model.
	ComparisonOptIn bool      `json:"comparison_opt_in"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateRifleInput struct {
	Make      string   `json:"make"`
	Model     string   `json:"model"`
	Calibre   string   `json:"calibre"`
	PowerFtLb *float64 `json:"power_ftlb"`
	TuneNotes *string  `json:"tune_notes"`
	ImageURL  *string  `json:"image_url"`
}

type UpdateRifleInput struct {
	Make            *string  `json:"make"`
	Model           *string  `json:"model"`
	Calibre         *string  `json:"calibre"`
	PowerFtLb       *float64 `json:"power_ftlb"`
	TuneNotes       *string  `json:"tune_notes"`
	ImageURL        *string  `json:"image_url"`
	IsActive        *bool    `json:"is_active"`
	ComparisonOptIn *bool    `json:"comparison_opt_in"`
}
