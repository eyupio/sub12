-- League, club and event notification preferences.
--
-- Email defaults follow the reach of the type: a message addressed to one
-- person defaults to email on, a broadcast to every member/participant/follower
-- defaults to email off, so joining a busy league doesn't fill an inbox.
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS score_validation_requested BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_join_request BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_join_rejected BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_role_changed BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_round_opened BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS club_join_request BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS club_join_rejected BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS club_role_changed BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_invitation BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_participant_joined BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_went_live BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_results_posted BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS score_validation_requested_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS league_join_request_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_join_rejected_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_role_changed_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS league_round_opened_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS club_join_request_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS club_join_rejected_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS club_role_changed_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_invitation_email BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_participant_joined_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS event_went_live_email BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS event_results_posted_email BOOLEAN NOT NULL DEFAULT FALSE;
