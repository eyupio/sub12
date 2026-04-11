package model

import "time"

type Image struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Data        []byte    `json:"-"`
	ContentType string    `json:"content_type"`
	SizeBytes   int       `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}
