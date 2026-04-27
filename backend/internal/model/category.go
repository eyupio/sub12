package model

import "time"

// Category is a platform-wide participant classification (e.g. Open, Lady,
// Veteran, Springer, PCP). Live Events reference a subset of categories per
// event; future features may reuse the same master list.
type Category struct {
	ID        string    `json:"id"`
	Slug      string    `json:"slug"`
	Label     string    `json:"label"`
	SortOrder int       `json:"sort_order"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateCategoryInput struct {
	Slug      string `json:"slug"`
	Label     string `json:"label"`
	SortOrder *int   `json:"sort_order"`
}

type UpdateCategoryInput struct {
	Slug      *string `json:"slug"`
	Label     *string `json:"label"`
	SortOrder *int    `json:"sort_order"`
	IsActive  *bool   `json:"is_active"`
}
