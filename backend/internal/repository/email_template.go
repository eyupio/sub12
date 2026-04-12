package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type EmailTemplateRepository struct {
	db *pgxpool.Pool
}

func NewEmailTemplateRepository(db *pgxpool.Pool) *EmailTemplateRepository {
	return &EmailTemplateRepository{db: db}
}

func scanEmailTemplate(row pgx.Row) (*model.EmailTemplate, error) {
	var item model.EmailTemplate
	if err := row.Scan(
		&item.Key,
		&item.SubjectTemplate,
		&item.HTMLTemplate,
		&item.TextTemplate,
		&item.IsEnabled,
		&item.UpdatedBy,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *EmailTemplateRepository) List(ctx context.Context) ([]*model.EmailTemplate, error) {
	rows, err := r.db.Query(ctx, `
		SELECT key, subject_template, html_template, text_template, is_enabled, updated_by::text, updated_at
		FROM email_templates
		ORDER BY key
	`)
	if err != nil {
		return nil, fmt.Errorf("list email templates: %w", err)
	}
	defer rows.Close()

	items := make([]*model.EmailTemplate, 0)
	for rows.Next() {
		var item model.EmailTemplate
		if err := rows.Scan(
			&item.Key,
			&item.SubjectTemplate,
			&item.HTMLTemplate,
			&item.TextTemplate,
			&item.IsEnabled,
			&item.UpdatedBy,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan email template: %w", err)
		}
		items = append(items, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate email templates: %w", err)
	}
	return items, nil
}

func (r *EmailTemplateRepository) GetByKey(ctx context.Context, key string) (*model.EmailTemplate, error) {
	item, err := scanEmailTemplate(r.db.QueryRow(ctx, `
		SELECT key, subject_template, html_template, text_template, is_enabled, updated_by::text, updated_at
		FROM email_templates
		WHERE key = $1
	`, key))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get email template by key: %w", err)
	}
	return item, nil
}

func (r *EmailTemplateRepository) Update(ctx context.Context, item *model.EmailTemplate, updatedBy string) (*model.EmailTemplate, error) {
	updated, err := scanEmailTemplate(r.db.QueryRow(ctx, `
		UPDATE email_templates
		SET
			subject_template = $2,
			html_template = $3,
			text_template = $4,
			is_enabled = $5,
			updated_by = $6::uuid,
			updated_at = NOW()
		WHERE key = $1
		RETURNING key, subject_template, html_template, text_template, is_enabled, updated_by::text, updated_at
	`, item.Key, item.SubjectTemplate, item.HTMLTemplate, item.TextTemplate, item.IsEnabled, updatedBy))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update email template: %w", err)
	}
	return updated, nil
}
