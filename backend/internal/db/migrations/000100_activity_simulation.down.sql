DROP TABLE IF EXISTS simulation_settings;

DROP INDEX IF EXISTS idx_users_is_simulated;

ALTER TABLE users
    DROP COLUMN IF EXISTS is_simulated;
