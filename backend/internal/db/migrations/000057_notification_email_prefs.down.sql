ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS mention_email,
    DROP COLUMN IF EXISTS club_join_approved_email,
    DROP COLUMN IF EXISTS league_join_approved_email,
    DROP COLUMN IF EXISTS score_amended_email,
    DROP COLUMN IF EXISTS score_rejected_email,
    DROP COLUMN IF EXISTS score_verified_email,
    DROP COLUMN IF EXISTS like_on_my_content_email,
    DROP COLUMN IF EXISTS reply_to_my_comment_email,
    DROP COLUMN IF EXISTS comment_on_my_card_email,
    DROP COLUMN IF EXISTS follow_accepted_email,
    DROP COLUMN IF EXISTS follow_request_email;
