-- Announcements: a human-authored message broadcast to a group's whole
-- audience. The delivered copies are ordinary notification rows; this table is
-- the single stored original they all point at, so the body is written once
-- and an edit-free audit of who announced what survives.
CREATE TABLE IF NOT EXISTS announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope           TEXT NOT NULL,
    league_id       UUID REFERENCES leagues(id) ON DELETE CASCADE,
    club_id         UUID REFERENCES clubs(id)   ON DELETE CASCADE,
    event_id        UUID REFERENCES events(id)  ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    -- How many recipients the fan-out was addressed to, recorded at send time.
    -- Not a live count: people join and leave, and the sender wants to know the
    -- reach of the message they sent.
    recipient_count INTEGER NOT NULL DEFAULT 0,
    email_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE announcements
        ADD CONSTRAINT announcements_scope_check
        CHECK (scope IN ('platform', 'league', 'club', 'event'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Exactly one scope target, and it has to match the scope column: a 'league'
-- announcement with a null league_id would be undeliverable and invisible.
DO $$ BEGIN
    ALTER TABLE announcements
        ADD CONSTRAINT announcements_scope_target_check
        CHECK (
            (scope = 'platform' AND league_id IS NULL AND club_id IS NULL AND event_id IS NULL)
         OR (scope = 'league'   AND league_id IS NOT NULL AND club_id IS NULL AND event_id IS NULL)
         OR (scope = 'club'     AND club_id   IS NOT NULL AND league_id IS NULL AND event_id IS NULL)
         OR (scope = 'event'    AND event_id  IS NOT NULL AND league_id IS NULL AND club_id IS NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_league_created_at
    ON announcements (league_id, created_at DESC) WHERE league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_club_created_at
    ON announcements (club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_event_created_at
    ON announcements (event_id, created_at DESC) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_platform_created_at
    ON announcements (created_at DESC) WHERE scope = 'platform';
