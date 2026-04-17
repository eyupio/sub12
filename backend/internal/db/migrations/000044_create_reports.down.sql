DROP INDEX IF EXISTS idx_reports_target;
DROP INDEX IF EXISTS idx_reports_status_created_at;
ALTER TABLE IF EXISTS reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE IF EXISTS reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
DROP TABLE IF EXISTS reports;
