package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type FAQRepository struct {
	db *pgxpool.Pool
}

func NewFAQRepository(db *pgxpool.Pool) *FAQRepository {
	return &FAQRepository{db: db}
}

func scanFAQ(row pgx.Row) (*model.FAQ, error) {
	var item model.FAQ
	if err := row.Scan(
		&item.ID,
		&item.Slug,
		&item.Category,
		&item.Question,
		&item.AnswerMD,
		&item.SortOrder,
		&item.CategoryOrder,
		&item.IsPublished,
		&item.UpdatedBy,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

const faqColumns = `id::text, slug, category, question, answer_md, sort_order, category_order, is_published, updated_by::text, created_at, updated_at`

func (r *FAQRepository) List(ctx context.Context, onlyPublished bool) ([]*model.FAQ, error) {
	query := `SELECT ` + faqColumns + ` FROM faqs`
	if onlyPublished {
		query += ` WHERE is_published = TRUE`
	}
	query += ` ORDER BY category_order, category, sort_order, question`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list faqs: %w", err)
	}
	defer rows.Close()

	items := make([]*model.FAQ, 0)
	for rows.Next() {
		item, err := scanFAQ(rows)
		if err != nil {
			return nil, fmt.Errorf("scan faq: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate faqs: %w", err)
	}
	return items, nil
}

func (r *FAQRepository) GetByID(ctx context.Context, id string) (*model.FAQ, error) {
	item, err := scanFAQ(r.db.QueryRow(ctx, `SELECT `+faqColumns+` FROM faqs WHERE id = $1::uuid`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get faq by id: %w", err)
	}
	return item, nil
}

func (r *FAQRepository) GetBySlug(ctx context.Context, slug string) (*model.FAQ, error) {
	item, err := scanFAQ(r.db.QueryRow(ctx, `SELECT `+faqColumns+` FROM faqs WHERE slug = $1`, slug))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get faq by slug: %w", err)
	}
	return item, nil
}

func (r *FAQRepository) Create(ctx context.Context, item *model.FAQ, updatedBy string) (*model.FAQ, error) {
	created, err := scanFAQ(r.db.QueryRow(ctx, `
		INSERT INTO faqs (slug, category, question, answer_md, sort_order, category_order, is_published, updated_by)
		VALUES (
			$1, $2, $3, $4, $5,
			COALESCE(
				(SELECT MIN(category_order) FROM faqs WHERE category = $2),
				(SELECT COALESCE(MAX(category_order), 0) + 10 FROM faqs)
			),
			$6, $7::uuid
		)
		RETURNING `+faqColumns,
		item.Slug, item.Category, item.Question, item.AnswerMD, item.SortOrder, item.IsPublished, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("create faq: %w", err)
	}
	return created, nil
}

func (r *FAQRepository) Update(ctx context.Context, id string, item *model.FAQ, updatedBy string) (*model.FAQ, error) {
	updated, err := scanFAQ(r.db.QueryRow(ctx, `
		UPDATE faqs
		SET
			slug = $2,
			category = $3,
			question = $4,
			answer_md = $5,
			sort_order = $6,
			category_order = COALESCE(
				(SELECT MIN(category_order) FROM faqs WHERE category = $3 AND id <> $1::uuid),
				faqs.category_order
			),
			is_published = $7,
			updated_by = $8::uuid,
			updated_at = NOW()
		WHERE id = $1::uuid
		RETURNING `+faqColumns,
		id, item.Slug, item.Category, item.Question, item.AnswerMD, item.SortOrder, item.IsPublished, updatedBy))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update faq: %w", err)
	}
	return updated, nil
}

func (r *FAQRepository) Delete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM faqs WHERE id = $1::uuid`, id)
	if err != nil {
		return fmt.Errorf("delete faq: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *FAQRepository) ReorderItems(ctx context.Context, items []model.ReorderFAQItem, updatedBy string) error {
	if len(items) == 0 {
		return nil
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder items: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, it := range items {
		if _, err := tx.Exec(ctx, `
			UPDATE faqs
			SET sort_order = $2, updated_by = $3::uuid, updated_at = NOW()
			WHERE id = $1::uuid`,
			it.ID, it.SortOrder, updatedBy); err != nil {
			return fmt.Errorf("update faq sort_order: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder items: %w", err)
	}
	return nil
}

func (r *FAQRepository) ReorderSections(ctx context.Context, sections []model.ReorderFAQSection, updatedBy string) error {
	if len(sections) == 0 {
		return nil
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder sections: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, s := range sections {
		if _, err := tx.Exec(ctx, `
			UPDATE faqs
			SET category_order = $2, updated_by = $3::uuid, updated_at = NOW()
			WHERE category = $1`,
			s.Category, s.CategoryOrder, updatedBy); err != nil {
			return fmt.Errorf("update faq category_order: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder sections: %w", err)
	}
	return nil
}
