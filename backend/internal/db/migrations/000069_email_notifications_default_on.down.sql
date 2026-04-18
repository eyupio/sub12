-- Revert email notification column defaults back to FALSE. Existing row
-- values are left as-is; they can only be reset individually by users.

ALTER TABLE notification_preferences
    ALTER COLUMN follow_request_email       SET DEFAULT FALSE,
    ALTER COLUMN follow_accepted_email      SET DEFAULT FALSE,
    ALTER COLUMN comment_on_my_card_email   SET DEFAULT FALSE,
    ALTER COLUMN reply_to_my_comment_email  SET DEFAULT FALSE,
    ALTER COLUMN like_on_my_content_email   SET DEFAULT FALSE,
    ALTER COLUMN score_verified_email       SET DEFAULT FALSE,
    ALTER COLUMN score_rejected_email       SET DEFAULT FALSE,
    ALTER COLUMN score_amended_email        SET DEFAULT FALSE,
    ALTER COLUMN league_join_approved_email SET DEFAULT FALSE,
    ALTER COLUMN club_join_approved_email   SET DEFAULT FALSE,
    ALTER COLUMN mention_email              SET DEFAULT FALSE,
    ALTER COLUMN ticket_created_email       SET DEFAULT FALSE,
    ALTER COLUMN ticket_replied_email       SET DEFAULT FALSE,
    ALTER COLUMN ticket_assigned_email      SET DEFAULT FALSE,
    ALTER COLUMN ticket_status_changed_email SET DEFAULT FALSE,
    ALTER COLUMN feature_request_state_changed_email SET DEFAULT FALSE;
