-- Live Events: a peer of leagues that can be standalone or club-attached.
-- The slug is the human-readable "Event ID" shared with participants.
-- discipline is free text (matches score_cards.discipline shape); structured
-- per-discipline configuration lives in the course and scoring_rules JSONB
-- columns, populated from a frontend preset on create.

CREATE TABLE IF NOT EXISTS events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    description    TEXT,
    location       TEXT,
    starts_at      TIMESTAMPTZ,
    ends_at        TIMESTAMPTZ,
    archive_at     TIMESTAMPTZ,
    discipline     TEXT NOT NULL,
    course         JSONB NOT NULL DEFAULT '{}'::jsonb,
    scoring_rules  JSONB NOT NULL DEFAULT '{}'::jsonb,
    category_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
    visibility     TEXT NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public', 'club_only', 'unlisted')),
    state          TEXT NOT NULL DEFAULT 'draft'
                   CHECK (state IN ('draft', 'open_for_entries', 'live', 'complete', 'archived')),
    owner_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    club_id        UUID NULL REFERENCES clubs(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_state_starts_at
    ON events (state, starts_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_events_owner
    ON events (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_club_id
    ON events (club_id) WHERE club_id IS NOT NULL;

-- Used by the daily archive sweep to find completed events whose 30-day window
-- has elapsed.
CREATE INDEX IF NOT EXISTS idx_events_archive_due
    ON events (archive_at)
    WHERE state = 'complete' AND archive_at IS NOT NULL;
