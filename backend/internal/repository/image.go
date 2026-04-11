package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ImageRepository struct {
	db *pgxpool.Pool
}

func NewImageRepository(db *pgxpool.Pool) *ImageRepository {
	return &ImageRepository{db: db}
}

// Create stores an image and returns it (without the data blob).
func (r *ImageRepository) Create(ctx context.Context, userID string, data []byte, contentType string) (*model.Image, error) {
	var img model.Image
	err := r.db.QueryRow(ctx, `
		INSERT INTO images (user_id, data, content_type, size_bytes)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, content_type, size_bytes, created_at
	`, userID, data, contentType, len(data)).Scan(
		&img.ID, &img.UserID, &img.ContentType, &img.SizeBytes, &img.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create image: %w", err)
	}
	return &img, nil
}

// GetByID retrieves an image including the data blob.
func (r *ImageRepository) GetByID(ctx context.Context, id string) (*model.Image, error) {
	var img model.Image
	err := r.db.QueryRow(ctx, `
		SELECT id, user_id, data, content_type, size_bytes, created_at
		FROM images WHERE id = $1
	`, id).Scan(
		&img.ID, &img.UserID, &img.Data, &img.ContentType, &img.SizeBytes, &img.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get image: %w", err)
	}
	return &img, nil
}
