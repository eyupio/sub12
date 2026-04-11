-- Enums for league configuration
CREATE TYPE scoring_rule AS ENUM ('highest', 'average');
CREATE TYPE join_policy  AS ENUM ('open', 'invite_code', 'approval');

-- League configuration (1-to-1 with leagues)
CREATE TABLE league_configs (
    league_id                  UUID PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
    starts_on                  DATE,
    ends_on                    DATE,
    max_submissions_per_round  SMALLINT NOT NULL DEFAULT 1,
    scoring_rule               scoring_rule NOT NULL DEFAULT 'highest',
    join_policy                join_policy  NOT NULL DEFAULT 'open',
    require_score_verification BOOLEAN  NOT NULL DEFAULT FALSE,
    required_confirmations     SMALLINT NOT NULL DEFAULT 0,
    require_image_upload       BOOLEAN  NOT NULL DEFAULT FALSE,
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Join requests for approval-based leagues
CREATE TABLE league_join_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    decided_by  UUID REFERENCES users(id),
    decided_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, user_id)
);

CREATE INDEX idx_join_requests_league_status ON league_join_requests (league_id, status);

-- Peer verification of score cards
CREATE TABLE score_confirmations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_card_id UUID NOT NULL REFERENCES score_cards(id) ON DELETE CASCADE,
    confirmed_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (score_card_id, confirmed_by)
);

CREATE INDEX idx_score_confirmations_card ON score_confirmations (score_card_id);

-- Admin audit trail for score card amendments / rejections
CREATE TABLE score_card_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_card_id   UUID NOT NULL REFERENCES score_cards(id) ON DELETE CASCADE,
    action          TEXT NOT NULL CHECK (action IN ('amend','reject')),
    performed_by    UUID NOT NULL REFERENCES users(id),
    reason          TEXT,
    old_total_score SMALLINT,
    new_total_score SMALLINT,
    old_x_count     SMALLINT,
    new_x_count     SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_card_actions_card ON score_card_actions (score_card_id);

-- Seed default config for all existing leagues
INSERT INTO league_configs (league_id)
SELECT id FROM leagues
WHERE id NOT IN (SELECT league_id FROM league_configs);
