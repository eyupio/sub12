package model

import "time"

type BackupSettings struct {
	ID                    int16     `json:"id"`
	Enabled               bool      `json:"enabled"`
	Frequency             string    `json:"frequency"`
	HourOfDay             int16     `json:"hour_of_day"`
	DayOfWeek             int16     `json:"day_of_week"`
	Destination           string    `json:"destination"`
	LocalPath             string    `json:"local_path"`
	S3Endpoint            *string   `json:"s3_endpoint,omitempty"`
	S3Region              *string   `json:"s3_region,omitempty"`
	S3Bucket              *string   `json:"s3_bucket,omitempty"`
	S3Prefix              *string   `json:"s3_prefix,omitempty"`
	S3AccessKeyEncrypted  *string   `json:"-"`
	S3SecretKeyEncrypted  *string   `json:"-"`
	S3UseSSL              bool      `json:"s3_use_ssl"`
	S3PathStyle           bool      `json:"s3_path_style"`
	PassphraseEncrypted   *string   `json:"-"`
	RetainCount           int       `json:"retain_count"`
	RetainDays            int       `json:"retain_days"`
	LastRunAt             *time.Time `json:"last_run_at,omitempty"`
	LastRunStatus         *string   `json:"last_run_status,omitempty"`
	LastRunError          *string   `json:"last_run_error,omitempty"`
	UpdatedBy             *string   `json:"updated_by,omitempty"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type BackupSettingsResponse struct {
	ID              int16      `json:"id"`
	Enabled         bool       `json:"enabled"`
	Frequency       string     `json:"frequency"`
	HourOfDay       int16      `json:"hour_of_day"`
	DayOfWeek       int16      `json:"day_of_week"`
	Destination     string     `json:"destination"`
	LocalPath       string     `json:"local_path"`
	S3Endpoint      *string    `json:"s3_endpoint,omitempty"`
	S3Region        *string    `json:"s3_region,omitempty"`
	S3Bucket        *string    `json:"s3_bucket,omitempty"`
	S3Prefix        *string    `json:"s3_prefix,omitempty"`
	S3UseSSL        bool       `json:"s3_use_ssl"`
	S3PathStyle     bool       `json:"s3_path_style"`
	HasS3AccessKey  bool       `json:"has_s3_access_key"`
	HasS3SecretKey  bool       `json:"has_s3_secret_key"`
	HasPassphrase   bool       `json:"has_passphrase"`
	RetainCount     int        `json:"retain_count"`
	RetainDays      int        `json:"retain_days"`
	LastRunAt       *time.Time `json:"last_run_at,omitempty"`
	LastRunStatus   *string    `json:"last_run_status,omitempty"`
	LastRunError    *string    `json:"last_run_error,omitempty"`
	UpdatedBy       *string    `json:"updated_by,omitempty"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type UpsertBackupSettingsInput struct {
	Enabled        bool    `json:"enabled"`
	Frequency      string  `json:"frequency"`
	HourOfDay      int16   `json:"hour_of_day"`
	DayOfWeek      int16   `json:"day_of_week"`
	Destination    string  `json:"destination"`
	LocalPath      string  `json:"local_path"`
	S3Endpoint     *string `json:"s3_endpoint"`
	S3Region       *string `json:"s3_region"`
	S3Bucket       *string `json:"s3_bucket"`
	S3Prefix       *string `json:"s3_prefix"`
	S3AccessKey    *string `json:"s3_access_key"`
	S3SecretKey    *string `json:"s3_secret_key"`
	S3UseSSL       bool    `json:"s3_use_ssl"`
	S3PathStyle    bool    `json:"s3_path_style"`
	Passphrase     *string `json:"passphrase"`
	RetainCount    int     `json:"retain_count"`
	RetainDays     int     `json:"retain_days"`
}

func (s *BackupSettings) ToResponse() *BackupSettingsResponse {
	if s == nil {
		return nil
	}
	return &BackupSettingsResponse{
		ID:             s.ID,
		Enabled:        s.Enabled,
		Frequency:      s.Frequency,
		HourOfDay:      s.HourOfDay,
		DayOfWeek:      s.DayOfWeek,
		Destination:    s.Destination,
		LocalPath:      s.LocalPath,
		S3Endpoint:     s.S3Endpoint,
		S3Region:       s.S3Region,
		S3Bucket:       s.S3Bucket,
		S3Prefix:       s.S3Prefix,
		S3UseSSL:       s.S3UseSSL,
		S3PathStyle:    s.S3PathStyle,
		HasS3AccessKey: s.S3AccessKeyEncrypted != nil && *s.S3AccessKeyEncrypted != "",
		HasS3SecretKey: s.S3SecretKeyEncrypted != nil && *s.S3SecretKeyEncrypted != "",
		HasPassphrase:  s.PassphraseEncrypted != nil && *s.PassphraseEncrypted != "",
		RetainCount:    s.RetainCount,
		RetainDays:     s.RetainDays,
		LastRunAt:      s.LastRunAt,
		LastRunStatus:  s.LastRunStatus,
		LastRunError:   s.LastRunError,
		UpdatedBy:      s.UpdatedBy,
		UpdatedAt:      s.UpdatedAt,
	}
}

type BackupRun struct {
	ID          string     `json:"id"`
	StartedAt   time.Time  `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at,omitempty"`
	Status      string     `json:"status"`
	Trigger     string     `json:"trigger"`
	Destination string     `json:"destination"`
	Filename    string     `json:"filename"`
	LocalPath   *string    `json:"local_path,omitempty"`
	S3Key       *string    `json:"s3_key,omitempty"`
	SizeBytes   int64      `json:"size_bytes"`
	Error       *string    `json:"error,omitempty"`
	CreatedBy   *string    `json:"created_by,omitempty"`
}
