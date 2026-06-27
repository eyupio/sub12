-- Extends activity simulation with: unfollow + share actions and counters,
-- time-of-day shaping (hourly multipliers), a public-content visibility toggle,
-- and runner tick-health tracking. All additive and idempotent.

ALTER TABLE simulation_settings
    ADD COLUMN IF NOT EXISTS unfollow_weight      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS share_weight         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unfollow_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS share_count          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hourly_multipliers   JSONB   NOT NULL DEFAULT '[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]'::jsonb,
    ADD COLUMN IF NOT EXISTS include_in_public_stats BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_tick_at         TIMESTAMPTZ;

ALTER TABLE simulation_settings
    ADD CONSTRAINT IF NOT EXISTS simulation_settings_unfollow_weight_chk CHECK (unfollow_weight >= 0),
    ADD CONSTRAINT IF NOT EXISTS simulation_settings_share_weight_chk    CHECK (share_weight >= 0);
