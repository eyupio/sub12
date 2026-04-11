package model

import "time"

type Pellet struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	Brand         string    `json:"brand"`
	Model         string    `json:"model"`
	HeadSizeMM    *float64  `json:"head_size_mm,omitempty"`
	WeightGrains  *float64  `json:"weight_grains,omitempty"`
	BatchCode     *string   `json:"batch_code,omitempty"`
	Notes         *string   `json:"notes,omitempty"`
	ImageURL      *string   `json:"image_url,omitempty"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreatePelletInput struct {
	Brand        string   `json:"brand"`
	Model        string   `json:"model"`
	HeadSizeMM   *float64 `json:"head_size_mm"`
	WeightGrains *float64 `json:"weight_grains"`
	BatchCode    *string  `json:"batch_code"`
	Notes        *string  `json:"notes"`
}

type UpdatePelletInput struct {
	Brand        *string  `json:"brand"`
	Model        *string  `json:"model"`
	HeadSizeMM   *float64 `json:"head_size_mm"`
	WeightGrains *float64 `json:"weight_grains"`
	BatchCode    *string  `json:"batch_code"`
	Notes        *string  `json:"notes"`
	ImageURL     *string  `json:"image_url"`
	IsActive     *bool    `json:"is_active"`
}
