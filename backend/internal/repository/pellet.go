package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type PelletRepository struct {
	db *pgxpool.Pool
}

func NewPelletRepository(db *pgxpool.Pool) *PelletRepository {
	return &PelletRepository{db: db}
}

func scanPellet(row pgx.Row) (*model.Pellet, error) {
	var p model.Pellet
	err := row.Scan(
		&p.ID, &p.UserID, &p.Brand, &p.Model,
		&p.HeadSizeMM, &p.WeightGrains, &p.BatchCode, &p.Notes,
		&p.ImageURL, &p.IsActive, &p.ComparisonOptIn, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PelletRepository) Create(ctx context.Context, userID string, in *model.CreatePelletInput) (*model.Pellet, error) {
	pellet, err := scanPellet(r.db.QueryRow(ctx, `
		INSERT INTO pellets (user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, comparison_opt_in, created_at, updated_at
	`, userID, in.Brand, in.Model, in.HeadSizeMM, in.WeightGrains, in.BatchCode, in.Notes, in.ImageURL))
	if err != nil {
		return nil, fmt.Errorf("create pellet: %w", err)
	}
	return pellet, nil
}

func (r *PelletRepository) ListByUser(ctx context.Context, userID string, activeOnly bool) ([]*model.Pellet, error) {
	query := `
		SELECT id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, comparison_opt_in, created_at, updated_at
		FROM pellets WHERE user_id = $1`
	if activeOnly {
		query += ` AND is_active = TRUE`
	}
	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list pellets: %w", err)
	}
	defer rows.Close()

	var pellets []*model.Pellet
	for rows.Next() {
		p, err := scanPellet(rows)
		if err != nil {
			return nil, fmt.Errorf("scan pellet: %w", err)
		}
		pellets = append(pellets, p)
	}
	return pellets, rows.Err()
}

func (r *PelletRepository) GetByID(ctx context.Context, id, userID string) (*model.Pellet, error) {
	pellet, err := scanPellet(r.db.QueryRow(ctx, `
		SELECT id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, comparison_opt_in, created_at, updated_at
		FROM pellets WHERE id = $1 AND user_id = $2
	`, id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get pellet: %w", err)
	}
	return pellet, nil
}

func (r *PelletRepository) Update(ctx context.Context, id, userID string, in *model.UpdatePelletInput) (*model.Pellet, error) {
	pellet, err := scanPellet(r.db.QueryRow(ctx, `
		UPDATE pellets SET
			brand         = COALESCE($3, brand),
			model         = COALESCE($4, model),
			head_size_mm  = COALESCE($5, head_size_mm),
			weight_grains = COALESCE($6, weight_grains),
			batch_code    = COALESCE($7, batch_code),
			notes         = COALESCE($8, notes),
			image_url     = COALESCE($9, image_url),
			is_active     = COALESCE($10, is_active),
			comparison_opt_in = COALESCE($11, comparison_opt_in),
			updated_at    = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, comparison_opt_in, created_at, updated_at
	`, id, userID, in.Brand, in.Model, in.HeadSizeMM, in.WeightGrains, in.BatchCode, in.Notes, in.ImageURL, in.IsActive, in.ComparisonOptIn))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update pellet: %w", err)
	}
	return pellet, nil
}

func (r *PelletRepository) UpdateImageURL(ctx context.Context, id, userID, imageURL string) (*model.Pellet, error) {
	pellet, err := scanPellet(r.db.QueryRow(ctx, `
		UPDATE pellets SET image_url = $3, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, comparison_opt_in, created_at, updated_at
	`, id, userID, imageURL))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update pellet image url: %w", err)
	}
	return pellet, nil
}

func (r *PelletRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM pellets WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete pellet: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetComparisonOptInAll flips the comparison opt-in on every pellet the user
// owns. Backs the one-switch control in the privacy centre.
func (r *PelletRepository) SetComparisonOptInAll(ctx context.Context, userID string, optIn bool) (int, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE pellets SET comparison_opt_in = $2, updated_at = NOW()
		WHERE user_id = $1 AND comparison_opt_in <> $2
	`, userID, optIn)
	if err != nil {
		return 0, fmt.Errorf("set pellet comparison opt-in: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
