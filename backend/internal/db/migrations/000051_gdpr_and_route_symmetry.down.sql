DROP INDEX IF EXISTS idx_data_export_requests_user_id;
DROP TABLE IF EXISTS data_export_requests;

DROP INDEX IF EXISTS idx_users_deleted_at;

ALTER TABLE users
    DROP COLUMN IF EXISTS deletion_requested_at,
    DROP COLUMN IF EXISTS deleted_at;
