DROP INDEX IF EXISTS idx_notification_prefs_review_club_leagues;
DROP INDEX IF EXISTS idx_notification_prefs_review_leagues;
DROP INDEX IF EXISTS idx_notification_prefs_review_public;

ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS review_requests_club_leagues,
    DROP COLUMN IF EXISTS review_requests_leagues,
    DROP COLUMN IF EXISTS review_requests_public;
