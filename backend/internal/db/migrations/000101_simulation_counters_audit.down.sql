DROP TABLE IF EXISTS simulation_audit;

DROP INDEX IF EXISTS idx_simulation_audit_created_at;

ALTER TABLE simulation_settings
    DROP COLUMN IF EXISTS total_actions,
    DROP COLUMN IF EXISTS post_count,
    DROP COLUMN IF EXISTS like_count,
    DROP COLUMN IF EXISTS comment_count,
    DROP COLUMN IF EXISTS follow_count,
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS last_error_at;
