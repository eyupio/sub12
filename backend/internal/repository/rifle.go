package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type RifleRepository struct {
	db *pgxpool.Pool
}

func NewRifleRepository(db *pgxpool.Pool) *RifleRepository {
	return &RifleRepository{db: db}
}

func scanRifle(row pgx.Row) (*model.Rifle, error) {
	var r model.Rifle
	err := row.Scan(
		&r.ID, &r.UserID, &r.Make, &r.Model, &r.Calibre,
		&r.PowerFtLb, &r.TuneNotes, &r.IsActive,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (r *RifleRepository) Create(ctx context.Context, userID string, in *model.CreateRifleInput) (*model.Rifle, error) {
	calibre := in.Calibre
	if calibre == "" {
		calibre = ".177"
	}
	rifle, err := scanRifle(r.db.QueryRow(ctx, `
		INSERT INTO rifles (user_id, make, model, calibre, power_ftlb, tune_notes)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, user_id, make, model, calibre, power_ftlb, tune_notes, is_active, created_at, updated_at
	`, userID, in.Make, in.Model, calibre, in.PowerFtLb, in.TuneNotes))
	if err != nil {
		return nil, fmt.Errorf("create rifle: %w", err)
	}
	return rifle, nil
}

func (r *RifleRepository) ListByUser(ctx context.Context, userID string, activeOnly bool) ([]*model.Rifle, error) {
	query := `
		SELECT id, user_id, make, model, calibre, power_ftlb, tune_notes, is_active, created_at, updated_at
		FROM rifles WHERE user_id = $1`
	if activeOnly {
		query += ` AND is_active = TRUE`
	}
	query += ` ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list rifles: %w", err)
	}
	defer rows.Close()

	var rifles []*model.Rifle
	for rows.Next() {
		rf, err := scanRifle(rows)
		if err != nil {
			return nil, fmt.Errorf("scan rifle: %w", err)
		}
		rifles = append(rifles, rf)
	}
	return rifles, rows.Err()
}

func (r *RifleRepository) GetByID(ctx context.Context, id, userID string) (*model.Rifle, error) {
	rifle, err := scanRifle(r.db.QueryRow(ctx, `
		SELECT id, user_id, make, model, calibre, power_ftlb, tune_notes, is_active, created_at, updated_at
		FROM rifles WHERE id = $1 AND user_id = $2
	`, id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get rifle: %w", err)
	}
	return rifle, nil
}

func (r *RifleRepository) Update(ctx context.Context, id, userID string, in *model.UpdateRifleInput) (*model.Rifle, error) {
	rifle, err := scanRifle(r.db.QueryRow(ctx, `
		UPDATE rifles SET
			make       = COALESCE($3, make),
			model      = COALESCE($4, model),
			calibre    = COALESCE($5, calibre),
			power_ftlb = COALESCE($6, power_ftlb),
			tune_notes = COALESCE($7, tune_notes),
			is_active  = COALESCE($8, is_active),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, make, model, calibre, power_ftlb, tune_notes, is_active, created_at, updated_at
	`, id, userID, in.Make, in.Model, in.Calibre, in.PowerFtLb, in.TuneNotes, in.IsActive))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update rifle: %w", err)
	}
	return rifle, nil
}

func (r *RifleRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM rifles WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete rifle: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
