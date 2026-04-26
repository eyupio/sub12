package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type BackupRepository struct {
	db *pgxpool.Pool
}

func NewBackupRepository(db *pgxpool.Pool) *BackupRepository {
	return &BackupRepository{db: db}
}

func scanBackupSettings(row pgx.Row) (*model.BackupSettings, error) {
	var s model.BackupSettings
	if err := row.Scan(
		&s.ID,
		&s.Enabled,
		&s.Frequency,
		&s.HourOfDay,
		&s.DayOfWeek,
		&s.Destination,
		&s.LocalPath,
		&s.S3Endpoint,
		&s.S3Region,
		&s.S3Bucket,
		&s.S3Prefix,
		&s.S3AccessKeyEncrypted,
		&s.S3SecretKeyEncrypted,
		&s.S3UseSSL,
		&s.S3PathStyle,
		&s.PassphraseEncrypted,
		&s.RetainCount,
		&s.RetainDays,
		&s.LastRunAt,
		&s.LastRunStatus,
		&s.LastRunError,
		&s.UpdatedBy,
		&s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

const backupSettingsCols = `id, enabled, frequency, hour_of_day, day_of_week, destination, local_path,
    s3_endpoint, s3_region, s3_bucket, s3_prefix, s3_access_key_encrypted, s3_secret_key_encrypted,
    s3_use_ssl, s3_path_style, passphrase_encrypted, retain_count, retain_days,
    last_run_at, last_run_status, last_run_error, updated_by::text, updated_at`

func (r *BackupRepository) GetSettings(ctx context.Context) (*model.BackupSettings, error) {
	settings, err := scanBackupSettings(r.db.QueryRow(ctx, `
		SELECT `+backupSettingsCols+`
		FROM backup_settings
		WHERE id = 1
	`))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get backup settings: %w", err)
	}
	return settings, nil
}

// UpsertSettings updates the singleton row, preserving any *_encrypted secret
// when the input value is nil (matches SMTP behavior).
func (r *BackupRepository) UpsertSettings(ctx context.Context, in *model.UpsertBackupSettingsInput, accessKey, secretKey, passphrase *string, updatedBy string) (*model.BackupSettings, error) {
	settings, err := scanBackupSettings(r.db.QueryRow(ctx, `
		INSERT INTO backup_settings (
			id, enabled, frequency, hour_of_day, day_of_week, destination, local_path,
			s3_endpoint, s3_region, s3_bucket, s3_prefix,
			s3_access_key_encrypted, s3_secret_key_encrypted,
			s3_use_ssl, s3_path_style, passphrase_encrypted,
			retain_count, retain_days, updated_by, updated_at
		) VALUES (
			1, $1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12,
			$13, $14, $15,
			$16, $17, $18::uuid, NOW()
		)
		ON CONFLICT (id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			frequency = EXCLUDED.frequency,
			hour_of_day = EXCLUDED.hour_of_day,
			day_of_week = EXCLUDED.day_of_week,
			destination = EXCLUDED.destination,
			local_path = EXCLUDED.local_path,
			s3_endpoint = EXCLUDED.s3_endpoint,
			s3_region = EXCLUDED.s3_region,
			s3_bucket = EXCLUDED.s3_bucket,
			s3_prefix = EXCLUDED.s3_prefix,
			s3_access_key_encrypted = COALESCE(EXCLUDED.s3_access_key_encrypted, backup_settings.s3_access_key_encrypted),
			s3_secret_key_encrypted = COALESCE(EXCLUDED.s3_secret_key_encrypted, backup_settings.s3_secret_key_encrypted),
			s3_use_ssl = EXCLUDED.s3_use_ssl,
			s3_path_style = EXCLUDED.s3_path_style,
			passphrase_encrypted = COALESCE(EXCLUDED.passphrase_encrypted, backup_settings.passphrase_encrypted),
			retain_count = EXCLUDED.retain_count,
			retain_days = EXCLUDED.retain_days,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()
		RETURNING `+backupSettingsCols+`
	`,
		in.Enabled, in.Frequency, in.HourOfDay, in.DayOfWeek, in.Destination, in.LocalPath,
		in.S3Endpoint, in.S3Region, in.S3Bucket, in.S3Prefix,
		accessKey, secretKey,
		in.S3UseSSL, in.S3PathStyle, passphrase,
		in.RetainCount, in.RetainDays, updatedBy,
	))
	if err != nil {
		return nil, fmt.Errorf("upsert backup settings: %w", err)
	}
	return settings, nil
}

// UpdateLastRun records the most recent scheduled/manual run outcome on the
// settings singleton so the admin UI can show "last run at / last status"
// without having to join backup_runs.
func (r *BackupRepository) UpdateLastRun(ctx context.Context, status string, errMsg *string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE backup_settings
		SET last_run_at = NOW(), last_run_status = $1, last_run_error = $2
		WHERE id = 1
	`, status, errMsg)
	return err
}

func scanBackupRun(row pgx.Row) (*model.BackupRun, error) {
	var run model.BackupRun
	if err := row.Scan(
		&run.ID,
		&run.StartedAt,
		&run.FinishedAt,
		&run.Status,
		&run.Trigger,
		&run.Destination,
		&run.Filename,
		&run.LocalPath,
		&run.S3Key,
		&run.SizeBytes,
		&run.Error,
		&run.CreatedBy,
	); err != nil {
		return nil, err
	}
	return &run, nil
}

const backupRunCols = `id::text, started_at, finished_at, status, trigger, destination, filename,
    local_path, s3_key, size_bytes, error, created_by::text`

func (r *BackupRepository) CreateRun(ctx context.Context, trigger, destination, filename string, createdBy *string) (*model.BackupRun, error) {
	run, err := scanBackupRun(r.db.QueryRow(ctx, `
		INSERT INTO backup_runs (trigger, destination, filename, created_by)
		VALUES ($1, $2, $3, $4::uuid)
		RETURNING `+backupRunCols+`
	`, trigger, destination, filename, createdBy))
	if err != nil {
		return nil, fmt.Errorf("create backup run: %w", err)
	}
	return run, nil
}

func (r *BackupRepository) FinishRun(ctx context.Context, id, status string, sizeBytes int64, localPath, s3Key *string, errMsg *string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE backup_runs
		SET finished_at = NOW(), status = $1, size_bytes = $2, local_path = $3, s3_key = $4, error = $5
		WHERE id = $6::uuid
	`, status, sizeBytes, localPath, s3Key, errMsg, id)
	return err
}

func (r *BackupRepository) GetRun(ctx context.Context, id string) (*model.BackupRun, error) {
	run, err := scanBackupRun(r.db.QueryRow(ctx, `
		SELECT `+backupRunCols+` FROM backup_runs WHERE id = $1::uuid
	`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get backup run: %w", err)
	}
	return run, nil
}

func (r *BackupRepository) ListRuns(ctx context.Context, limit, offset int) ([]*model.BackupRun, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.db.Query(ctx, `
		SELECT `+backupRunCols+` FROM backup_runs
		ORDER BY started_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list backup runs: %w", err)
	}
	defer rows.Close()
	var runs []*model.BackupRun
	for rows.Next() {
		run, err := scanBackupRun(rows)
		if err != nil {
			return nil, 0, err
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM backup_runs`).Scan(&total); err != nil {
		return nil, 0, err
	}
	return runs, total, nil
}

func (r *BackupRepository) DeleteRun(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM backup_runs WHERE id = $1::uuid`, id)
	return err
}

// ListSuccessfulRunsForRetention returns successful runs ordered newest-first
// so the prune step can keep the most recent N and discard the rest.
func (r *BackupRepository) ListSuccessfulRunsForRetention(ctx context.Context) ([]*model.BackupRun, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+backupRunCols+` FROM backup_runs
		WHERE status = 'success'
		ORDER BY started_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var runs []*model.BackupRun
	for rows.Next() {
		run, err := scanBackupRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}
