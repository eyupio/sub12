CREATE TYPE league_type AS ENUM ('public', 'private');

CREATE TABLE leagues (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    type        league_type NOT NULL DEFAULT 'public',
    join_code   TEXT UNIQUE,                -- for private leagues
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leagues_type ON leagues (type);

CREATE TABLE league_members (
    league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (league_id, user_id)
);

CREATE TABLE seasons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    starts_on   DATE NOT NULL,
    ends_on     DATE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rounds (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id   UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    opens_at    TIMESTAMPTZ,
    closes_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill the FK from score_cards to rounds
ALTER TABLE score_cards
    ADD CONSTRAINT fk_score_cards_round
    FOREIGN KEY (league_round_id) REFERENCES rounds(id) ON DELETE SET NULL;

-- Activity feed
CREATE TABLE activities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,              -- 'score_posted', 'pb', 'joined_league', etc.
    target_id   UUID,                       -- polymorphic target
    target_type TEXT,                       -- 'score_card', 'league', etc.
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_user       ON activities (user_id, created_at DESC);
CREATE INDEX idx_activities_created_at ON activities (created_at DESC);
