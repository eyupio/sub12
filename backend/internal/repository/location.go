package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type LocationRepository struct {
	db *pgxpool.Pool
}

func NewLocationRepository(db *pgxpool.Pool) *LocationRepository {
	return &LocationRepository{db: db}
}

func scanLocation(row pgx.Row) (*model.Location, error) {
	var l model.Location
	err := row.Scan(
		&l.ID, &l.UserID, &l.Name, &l.Address,
		&l.Lat, &l.Lng,
		&l.DefaultDistanceM, &l.DefaultDistanceUnit, &l.DefaultTargetPreset,
		&l.CustomTargetWidthMM, &l.CustomTargetHeightMM,
		&l.ImageURL,
		&l.Notes, &l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

const locationCols = `id, user_id, name, address, lat, lng, default_distance_m, default_distance_unit, default_target_preset, custom_target_width_mm, custom_target_height_mm, image_url, notes, created_at, updated_at`

func (r *LocationRepository) Create(ctx context.Context, userID string, in *model.CreateLocationInput) (*model.Location, error) {
	loc, err := scanLocation(r.db.QueryRow(ctx, `
		INSERT INTO locations (user_id, name, address, lat, lng, default_distance_m, default_distance_unit, default_target_preset, custom_target_width_mm, custom_target_height_mm, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING `+locationCols,
		userID, in.Name, in.Address, in.Lat, in.Lng,
		in.DefaultDistanceM, in.DefaultDistanceUnit, in.DefaultTargetPreset,
		in.CustomTargetWidthMM, in.CustomTargetHeightMM,
		in.Notes,
	))
	if err != nil {
		return nil, fmt.Errorf("create location: %w", err)
	}
	return loc, nil
}

func (r *LocationRepository) GetByID(ctx context.Context, id, userID string) (*model.Location, error) {
	loc, err := scanLocation(r.db.QueryRow(ctx, `
		SELECT `+locationCols+`
		FROM locations WHERE id = $1 AND user_id = $2
	`, id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get location: %w", err)
	}
	return loc, nil
}

func (r *LocationRepository) ListByUser(ctx context.Context, userID string) ([]*model.Location, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+locationCols+`
		FROM locations WHERE user_id = $1
		ORDER BY name ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list locations: %w", err)
	}
	defer rows.Close()

	var locs []*model.Location
	for rows.Next() {
		l, err := scanLocation(rows)
		if err != nil {
			return nil, fmt.Errorf("scan location: %w", err)
		}
		locs = append(locs, l)
	}
	return locs, rows.Err()
}

func (r *LocationRepository) Update(ctx context.Context, id, userID string, in *model.UpdateLocationInput) (*model.Location, error) {
	loc, err := scanLocation(r.db.QueryRow(ctx, `
		UPDATE locations SET
			name                    = COALESCE($3, name),
			address                 = $4,
			lat                     = $5,
			lng                     = $6,
			default_distance_m      = $7,
			default_distance_unit   = $8,
			default_target_preset   = $9,
			custom_target_width_mm  = $10,
			custom_target_height_mm = $11,
			notes                   = $12,
			updated_at              = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+locationCols,
		id, userID,
		in.Name, in.Address, in.Lat, in.Lng,
		in.DefaultDistanceM, in.DefaultDistanceUnit, in.DefaultTargetPreset,
		in.CustomTargetWidthMM, in.CustomTargetHeightMM,
		in.Notes,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update location: %w", err)
	}
	return loc, nil
}

func (r *LocationRepository) UpdateImageURL(ctx context.Context, id, userID, imageURL string) (*model.Location, error) {
	loc, err := scanLocation(r.db.QueryRow(ctx, `
		UPDATE locations SET image_url = $3, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+locationCols,
		id, userID, imageURL,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update location image url: %w", err)
	}
	return loc, nil
}

func (r *LocationRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM locations WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete location: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
