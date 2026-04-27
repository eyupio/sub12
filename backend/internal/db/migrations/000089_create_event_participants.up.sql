-- Event participants. Exactly one of (user_id, guest_name) is set:
--   - user_id non-null: registered sub12 user joined the event.
--   - guest_name non-null: owner-added guest with no account.
-- This is the first feature in the codebase that supports non-account
-- participants, so reads downstream COALESCE(u.display_name, p.guest_name).
-- A registered user can join an event at most once (partial unique index
-- skips guest rows whose user_id is NULL).

CREATE TABLE IF NOT EXISTS event_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    guest_name      TEXT NULL,
    team            TEXT NULL,
    category_id     UUID NULL REFERENCES categories(id),
    weapon_class    TEXT NULL,
    weapon_label    TEXT NULL,
    lane_assignment INT NULL,
    scorecard_id    UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT participant_identity CHECK (
        (user_id IS NOT NULL AND guest_name IS NULL) OR
        (user_id IS NULL AND guest_name IS NOT NULL AND length(trim(guest_name)) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_participants_unique_user
    ON event_participants (event_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_participants_event
    ON event_participants (event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_event_participants_user
    ON event_participants (user_id) WHERE user_id IS NOT NULL;
