package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type SMTPRepository struct {
	db *pgxpool.Pool
}

func NewSMTPRepository(db *pgxpool.Pool) *SMTPRepository {
	return &SMTPRepository{db: db}
}

func scanSMTPSettings(row pgx.Row) (*model.SMTPSettings, error) {
	var settings model.SMTPSettings
	if err := row.Scan(
		&settings.ID,
		&settings.Host,
		&settings.Port,
		&settings.Username,
		&settings.PasswordEncrypted,
		&settings.FromEmail,
		&settings.FromName,
		&settings.UseTLS,
		&settings.UseSTARTTLS,
		&settings.UpdatedBy,
		&settings.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &settings, nil
}

func (r *SMTPRepository) GetSMTPSettings(ctx context.Context) (*model.SMTPSettings, error) {
	settings, err := scanSMTPSettings(r.db.QueryRow(ctx, `
		SELECT id, host, port, username, password_encrypted, from_email, from_name, use_tls, use_starttls, updated_by::text, updated_at
		FROM smtp_settings
		WHERE id = 1
	`))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get smtp settings: %w", err)
	}
	return settings, nil
}

func (r *SMTPRepository) UpsertSMTPSettings(ctx context.Context, input *model.UpsertSMTPSettingsInput, updatedBy string) (*model.SMTPSettings, error) {
	settings, err := scanSMTPSettings(r.db.QueryRow(ctx, `
		INSERT INTO smtp_settings (
			id, host, port, username, password_encrypted, from_email, from_name, use_tls, use_starttls, updated_by, updated_at
		)
		VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, NOW())
		ON CONFLICT (id) DO UPDATE
		SET
			host = EXCLUDED.host,
			port = EXCLUDED.port,
			username = EXCLUDED.username,
			password_encrypted = COALESCE(EXCLUDED.password_encrypted, smtp_settings.password_encrypted),
			from_email = EXCLUDED.from_email,
			from_name = EXCLUDED.from_name,
			use_tls = EXCLUDED.use_tls,
			use_starttls = EXCLUDED.use_starttls,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()
		RETURNING id, host, port, username, password_encrypted, from_email, from_name, use_tls, use_starttls, updated_by::text, updated_at
	`, input.Host, input.Port, input.Username, input.PasswordEncrypted, input.FromEmail, input.FromName, input.UseTLS, input.UseSTARTTLS, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("upsert smtp settings: %w", err)
	}
	return settings, nil
}
