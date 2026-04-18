-- Flip per-event email notification defaults to TRUE so new users are opted
-- in by default, mirroring the in-app channel. Users can selectively disable
-- each type from their settings page.

ALTER TABLE notification_preferences
    ALTER COLUMN follow_request_email       SET DEFAULT TRUE,
    ALTER COLUMN follow_accepted_email      SET DEFAULT TRUE,
    ALTER COLUMN comment_on_my_card_email   SET DEFAULT TRUE,
    ALTER COLUMN reply_to_my_comment_email  SET DEFAULT TRUE,
    ALTER COLUMN like_on_my_content_email   SET DEFAULT TRUE,
    ALTER COLUMN score_verified_email       SET DEFAULT TRUE,
    ALTER COLUMN score_rejected_email       SET DEFAULT TRUE,
    ALTER COLUMN score_amended_email        SET DEFAULT TRUE,
    ALTER COLUMN league_join_approved_email SET DEFAULT TRUE,
    ALTER COLUMN club_join_approved_email   SET DEFAULT TRUE,
    ALTER COLUMN mention_email              SET DEFAULT TRUE,
    ALTER COLUMN ticket_created_email       SET DEFAULT TRUE,
    ALTER COLUMN ticket_replied_email       SET DEFAULT TRUE,
    ALTER COLUMN ticket_assigned_email      SET DEFAULT TRUE,
    ALTER COLUMN ticket_status_changed_email SET DEFAULT TRUE,
    ALTER COLUMN feature_request_state_changed_email SET DEFAULT TRUE;

-- Backfill existing rows that still hold the old FALSE default. Any user who
-- has already toggled a specific flag to TRUE is left untouched; users who
-- explicitly toggled to FALSE are also flipped on here — the settings page
-- lets them disable again. This matches the intent that email, like in-app,
-- is on by default across the board.
UPDATE notification_preferences
SET follow_request_email       = TRUE,
    follow_accepted_email      = TRUE,
    comment_on_my_card_email   = TRUE,
    reply_to_my_comment_email  = TRUE,
    like_on_my_content_email   = TRUE,
    score_verified_email       = TRUE,
    score_rejected_email       = TRUE,
    score_amended_email        = TRUE,
    league_join_approved_email = TRUE,
    club_join_approved_email   = TRUE,
    mention_email              = TRUE,
    ticket_created_email       = TRUE,
    ticket_replied_email       = TRUE,
    ticket_assigned_email      = TRUE,
    ticket_status_changed_email = TRUE,
    feature_request_state_changed_email = TRUE,
    updated_at                 = NOW();
