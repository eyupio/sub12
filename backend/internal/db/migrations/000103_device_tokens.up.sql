-- Push-notification device tokens.
--
-- One row per device registration. The token is globally unique: if a device
-- re-registers under a different account (e.g. a shared phone), the row is
-- reassigned to the new user rather than duplicated. Tokens are removed on
-- logout/unregister and cascade-deleted with the user.

CREATE TABLE IF NOT EXISTS device_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    platform   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (platform IN ('ios', 'android', 'web'))
);

-- Push fan-out looks up all of a recipient's tokens by user_id.
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens (user_id);
