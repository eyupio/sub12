-- Opting in to be asked to validate other people's score cards.
--
-- These are not delivery switches like the rest of notification_preferences —
-- they widen the *audience* of a validation request beyond the people it would
-- naturally reach (the shooter's followers, a league's moderators). All three
-- default off: being sent strangers' cards to check is a favour somebody
-- volunteers for, never something they are enrolled in.
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS review_requests_public BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_requests_leagues BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_requests_club_leagues BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notification_prefs_review_public
    ON notification_preferences (user_id) WHERE review_requests_public;
CREATE INDEX IF NOT EXISTS idx_notification_prefs_review_leagues
    ON notification_preferences (user_id) WHERE review_requests_leagues;
CREATE INDEX IF NOT EXISTS idx_notification_prefs_review_club_leagues
    ON notification_preferences (user_id) WHERE review_requests_club_leagues;
