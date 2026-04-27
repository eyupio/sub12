package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type CategoryRepository struct {
	db *pgxpool.Pool
}

func NewCategoryRepository(db *pgxpool.Pool) *CategoryRepository {
	return &CategoryRepository{db: db}
}

// List returns categories. When activeOnly is true, only is_active rows are
// returned (used by public clients populating event-create forms).
func (r *CategoryRepository) List(ctx context.Context, activeOnly bool) ([]*model.Category, error) {
	var rows pgx.Rows
	var err error
	if activeOnly {
		rows, err = r.db.Query(ctx, `
			SELECT id, slug, label, sort_order, is_active, created_at, updated_at
			FROM categories
			WHERE is_active = TRUE
			ORDER BY sort_order, label
		`)
	} else {
		rows, err = r.db.Query(ctx, `
			SELECT id, slug, label, sort_order, is_active, created_at, updated_at
			FROM categories
			ORDER BY sort_order, label
		`)
	}
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	var items []*model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Slug, &c.Label, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		items = append(items, &c)
	}
	return items, rows.Err()
}

func (r *CategoryRepository) GetByID(ctx context.Context, id string) (*model.Category, error) {
	var c model.Category
	err := r.db.QueryRow(ctx, `
		SELECT id, slug, label, sort_order, is_active, created_at, updated_at
		FROM categories
		WHERE id = $1
	`, id).Scan(&c.ID, &c.Slug, &c.Label, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get category: %w", err)
	}
	return &c, nil
}

// ExistAll returns true when every supplied id resolves to an active category.
// Used by event creation/update to validate category_ids without N+1 lookups.
func (r *CategoryRepository) ExistAll(ctx context.Context, ids []string) (bool, error) {
	if len(ids) == 0 {
		return true, nil
	}
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM categories
		WHERE id = ANY($1) AND is_active = TRUE
	`, ids).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("validate category ids: %w", err)
	}
	return n == len(ids), nil
}

func (r *CategoryRepository) Create(ctx context.Context, in *model.CreateCategoryInput) (*model.Category, error) {
	sortOrder := 0
	if in.SortOrder != nil {
		sortOrder = *in.SortOrder
	}
	var c model.Category
	err := r.db.QueryRow(ctx, `
		INSERT INTO categories (slug, label, sort_order)
		VALUES ($1, $2, $3)
		RETURNING id, slug, label, sort_order, is_active, created_at, updated_at
	`, in.Slug, in.Label, sortOrder).Scan(
		&c.ID, &c.Slug, &c.Label, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("insert category: %w", err)
	}
	return &c, nil
}

func (r *CategoryRepository) Update(ctx context.Context, id string, in *model.UpdateCategoryInput) (*model.Category, error) {
	var c model.Category
	err := r.db.QueryRow(ctx, `
		UPDATE categories SET
			slug       = COALESCE($2, slug),
			label      = COALESCE($3, label),
			sort_order = COALESCE($4, sort_order),
			is_active  = COALESCE($5, is_active),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, slug, label, sort_order, is_active, created_at, updated_at
	`, id, in.Slug, in.Label, in.SortOrder, in.IsActive).Scan(
		&c.ID, &c.Slug, &c.Label, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("update category: %w", err)
	}
	return &c, nil
}

func (r *CategoryRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM categories WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
