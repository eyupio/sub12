-- Club privacy and join policy, mirroring league privacy model.

DO $$ BEGIN
    CREATE TYPE club_type AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE club_join_policy AS ENUM ('open', 'invite_code', 'approval');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS type club_type NOT NULL DEFAULT 'public';

ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS join_policy club_join_policy NOT NULL DEFAULT 'open';

CREATE INDEX IF NOT EXISTS idx_clubs_type ON clubs (type);

CREATE TABLE IF NOT EXISTS club_join_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    decided_by  UUID REFERENCES users(id),
    decided_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_join_requests_club_status ON club_join_requests (club_id, status);
