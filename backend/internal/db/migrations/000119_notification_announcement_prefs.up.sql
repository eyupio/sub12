-- An announcement is the one broadcast whose email default is on: it is
-- human-authored, rate-limited by the effort of writing it, and the sender
-- decides per announcement whether email goes out at all. This column is the
-- recipient's veto over that decision, not the thing that triggers it.
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS announcement BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS announcement_email BOOLEAN NOT NULL DEFAULT TRUE;
