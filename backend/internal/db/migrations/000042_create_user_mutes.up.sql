-- Muting hides a user's activity from the muter's feed without cutting
-- interaction (unlike user_blocks, which is a hard severance).

CREATE TABLE IF NOT EXISTS user_mutes (
    muter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (muter_id, muted_id),
    CHECK (muter_id <> muted_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON user_mutes (muter_id);
