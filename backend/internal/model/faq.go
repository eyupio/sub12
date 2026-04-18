package model

import "time"

type FAQ struct {
	ID            string    `json:"id"`
	Slug          string    `json:"slug"`
	Category      string    `json:"category"`
	Question      string    `json:"question"`
	AnswerMD      string    `json:"answer_md"`
	SortOrder     int       `json:"sort_order"`
	CategoryOrder int       `json:"category_order"`
	IsPublished   bool      `json:"is_published"`
	UpdatedBy     *string   `json:"updated_by,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreateFAQInput struct {
	Slug        string `json:"slug"`
	Category    string `json:"category"`
	Question    string `json:"question"`
	AnswerMD    string `json:"answer_md"`
	SortOrder   int    `json:"sort_order"`
	IsPublished *bool  `json:"is_published"`
}

type UpdateFAQInput struct {
	Slug        *string `json:"slug"`
	Category    *string `json:"category"`
	Question    *string `json:"question"`
	AnswerMD    *string `json:"answer_md"`
	SortOrder   *int    `json:"sort_order"`
	IsPublished *bool   `json:"is_published"`
}

type ReorderFAQItem struct {
	ID        string `json:"id"`
	SortOrder int    `json:"sort_order"`
}

type ReorderFAQItemsInput struct {
	Items []ReorderFAQItem `json:"items"`
}

type ReorderFAQSection struct {
	Category      string `json:"category"`
	CategoryOrder int    `json:"category_order"`
}

type ReorderFAQSectionsInput struct {
	Sections []ReorderFAQSection `json:"sections"`
}
