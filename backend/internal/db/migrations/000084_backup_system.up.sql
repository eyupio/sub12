CREATE TABLE IF NOT EXISTS backup_settings (
    id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
    frequency                TEXT NOT NULL DEFAULT 'daily',
    hour_of_day              SMALLINT NOT NULL DEFAULT 3,
    day_of_week              SMALLINT NOT NULL DEFAULT 0,
    destination              TEXT NOT NULL DEFAULT 'local',
    local_path               TEXT NOT NULL DEFAULT '/var/lib/sub12/backups',
    s3_endpoint              TEXT,
    s3_region                TEXT,
    s3_bucket                TEXT,
    s3_prefix                TEXT,
    s3_access_key_encrypted  TEXT,
    s3_secret_key_encrypted  TEXT,
    s3_use_ssl               BOOLEAN NOT NULL DEFAULT TRUE,
    s3_path_style            BOOLEAN NOT NULL DEFAULT FALSE,
    passphrase_encrypted     TEXT,
    retain_count             INTEGER NOT NULL DEFAULT 7,
    retain_days              INTEGER NOT NULL DEFAULT 30,
    last_run_at              TIMESTAMPTZ,
    last_run_status          TEXT,
    last_run_error           TEXT,
    updated_by               UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (frequency IN ('disabled','hourly','daily','weekly')),
    CHECK (hour_of_day BETWEEN 0 AND 23),
    CHECK (day_of_week BETWEEN 0 AND 6),
    CHECK (destination IN ('local','s3','both')),
    CHECK (retain_count >= 0),
    CHECK (retain_days >= 0)
);

INSERT INTO backup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS backup_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ,
    status       TEXT NOT NULL DEFAULT 'running',
    trigger      TEXT NOT NULL,
    destination  TEXT NOT NULL,
    filename     TEXT NOT NULL,
    local_path   TEXT,
    s3_key       TEXT,
    size_bytes   BIGINT NOT NULL DEFAULT 0,
    error        TEXT,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN ('running','success','failed')),
    CHECK (trigger IN ('scheduled','manual')),
    CHECK (destination IN ('local','s3','both'))
);

CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx ON backup_runs (started_at DESC);
