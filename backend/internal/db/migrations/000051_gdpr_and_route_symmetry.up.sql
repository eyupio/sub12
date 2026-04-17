-- GDPR: soft-delete + data export support.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_requested_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS data_export_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    download_url  TEXT,
    expires_at    TIMESTAMPTZ
);

DO $$ BEGIN
    ALTER TABLE data_export_requests
        ADD CONSTRAINT data_export_requests_status_check
        CHECK (status IN ('pending', 'completed', 'failed', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_data_export_requests_user_id
    ON data_export_requests (user_id, requested_at DESC);
