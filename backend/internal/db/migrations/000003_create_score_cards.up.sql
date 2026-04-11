CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE score_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rifle_id        UUID REFERENCES rifles(id) ON DELETE SET NULL,
    pellet_id       UUID REFERENCES pellets(id) ON DELETE SET NULL,

    -- Match conditions
    shot_at         DATE NOT NULL,
    location        TEXT,
    wind_mph        NUMERIC(4,1),
    temp_celsius    NUMERIC(4,1),
    notes           TEXT,

    -- Scores: 25 shots, each 0-10, plus X flag
    -- Stored as parallel arrays for simplicity; normalised table optional later
    shot_scores     SMALLINT[] NOT NULL,     -- length 25, values 0-10
    shot_xs         BOOLEAN[] NOT NULL,      -- length 25

    -- Computed (maintained by trigger or app layer)
    total_score     SMALLINT NOT NULL,
    x_count         SMALLINT NOT NULL,

    -- Media & verification
    card_image_url  TEXT,
    verification    verification_status NOT NULL DEFAULT 'pending',

    -- League linkage (set when card is submitted to a round)
    league_round_id UUID,                   -- FK added in migration 004

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_cards_user     ON score_cards (user_id);
CREATE INDEX idx_score_cards_shot_at  ON score_cards (shot_at DESC);
CREATE INDEX idx_score_cards_total    ON score_cards (total_score DESC);

-- Comments on score cards
CREATE TABLE score_card_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id     UUID NOT NULL REFERENCES score_cards(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_card ON score_card_comments (card_id);
