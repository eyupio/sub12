DELETE FROM email_templates WHERE key = 'notification_report_filed';

ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS report_filed;

DROP INDEX IF EXISTS idx_reports_club_status;
DROP INDEX IF EXISTS idx_reports_league_status;

ALTER TABLE reports DROP COLUMN IF EXISTS club_id;
ALTER TABLE reports DROP COLUMN IF EXISTS league_id;
