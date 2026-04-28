-- Event invitations. Owners send invites to specific users; invitees receive
-- a branded email with an accept link. Accepting creates an event_participants
-- row via the existing Join flow. UNIQUE (event_id, invitee_user_id) means a
-- user is invited at most once per event; re-sends reuse the existing token.

CREATE TABLE IF NOT EXISTS event_invitations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    inviter_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token             TEXT NOT NULL UNIQUE,
    status            TEXT NOT NULL DEFAULT 'pending',
    expires_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at        TIMESTAMPTZ,
    CONSTRAINT event_invitations_status_check CHECK (status IN ('pending','accepted','declined','expired')),
    CONSTRAINT event_invitations_no_self CHECK (inviter_user_id <> invitee_user_id),
    UNIQUE (event_id, invitee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_invitations_event ON event_invitations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_invitee ON event_invitations (invitee_user_id);
