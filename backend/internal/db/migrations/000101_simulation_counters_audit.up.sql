-- Extends the activity simulation feature with per-action counters, last-error
-- tracking, and an audit log of admin operations (enable/disable, purge,
-- cleanup, persona delete, run-now). All additive and idempotent.

ALTER TABLE simulation_settings
    ADD COLUMN IF NOT EXISTS total_actions   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS post_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS like_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comment_count   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS follow_count    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error      TEXT,
    ADD COLUMN IF NOT EXISTS last_error_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS simulation_audit (
    id          BIGSERIAL PRIMARY KEY,
    event       TEXT NOT NULL,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulation_audit_created_at
    ON simulation_audit (created_at DESC);
