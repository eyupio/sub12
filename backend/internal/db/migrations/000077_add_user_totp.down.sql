DROP TABLE IF EXISTS user_backup_codes;

ALTER TABLE users DROP COLUMN IF EXISTS totp_enrolled_at;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
