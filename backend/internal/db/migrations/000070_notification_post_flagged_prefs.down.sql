ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS post_flagged_email,
    DROP COLUMN IF EXISTS post_flagged;
