ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS announcement_email,
    DROP COLUMN IF EXISTS announcement;
