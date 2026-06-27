-- Admin-controlled "activity simulation" feature.
--
-- Simulated accounts are real user rows flagged with is_simulated = TRUE so
-- their content is always auditable, filterable, and removable. A single-row
-- settings table holds the admin-controlled configuration for the background
-- simulation engine.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: the simulation engine repeatedly looks up the (small) set of
-- simulated accounts, so only those rows need indexing.
CREATE INDEX IF NOT EXISTS idx_users_is_simulated ON users (is_simulated) WHERE is_simulated;

CREATE TABLE IF NOT EXISTS simulation_settings (
    id                        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled                   BOOLEAN NOT NULL DEFAULT FALSE,
    persona_count             INTEGER NOT NULL DEFAULT 12,
    actions_per_hour          INTEGER NOT NULL DEFAULT 20,
    post_weight               INTEGER NOT NULL DEFAULT 2,
    like_weight               INTEGER NOT NULL DEFAULT 5,
    comment_weight            INTEGER NOT NULL DEFAULT 2,
    follow_weight             INTEGER NOT NULL DEFAULT 1,
    active_start_hour         SMALLINT NOT NULL DEFAULT 0,
    active_end_hour           SMALLINT NOT NULL DEFAULT 24,
    interact_with_real_users  BOOLEAN NOT NULL DEFAULT FALSE,
    max_cards_per_persona     INTEGER NOT NULL DEFAULT 30,
    last_run_at               TIMESTAMPTZ,
    last_action               TEXT,
    updated_by                UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (persona_count >= 0),
    CHECK (actions_per_hour >= 0),
    CHECK (post_weight >= 0),
    CHECK (like_weight >= 0),
    CHECK (comment_weight >= 0),
    CHECK (follow_weight >= 0),
    CHECK (active_start_hour BETWEEN 0 AND 23),
    CHECK (active_end_hour BETWEEN 1 AND 24),
    CHECK (max_cards_per_persona >= 0)
);

-- Initialize the singleton row (disabled by default).
INSERT INTO simulation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
