-- Reverse PT-2: drop measurement table and new session columns

DROP TABLE IF EXISTS pellet_test_measurements;

ALTER TABLE pellet_test_sessions
    DROP COLUMN IF EXISTS velocity_fps,
    DROP COLUMN IF EXISTS velocity_sd,
    DROP COLUMN IF EXISTS extreme_spread_fps,
    DROP COLUMN IF EXISTS bench_setup,
    DROP COLUMN IF EXISTS scope_details,
    DROP COLUMN IF EXISTS barometric_pressure_mbar;
