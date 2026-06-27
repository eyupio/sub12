ALTER TABLE simulation_settings
    DROP CONSTRAINT IF EXISTS simulation_settings_share_weight_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_unfollow_weight_chk;

ALTER TABLE simulation_settings
    DROP COLUMN IF EXISTS unfollow_weight,
    DROP COLUMN IF EXISTS share_weight,
    DROP COLUMN IF EXISTS unfollow_count,
    DROP COLUMN IF EXISTS share_count,
    DROP COLUMN IF EXISTS hourly_multipliers,
    DROP COLUMN IF EXISTS include_in_public_stats,
    DROP COLUMN IF EXISTS last_tick_at;
