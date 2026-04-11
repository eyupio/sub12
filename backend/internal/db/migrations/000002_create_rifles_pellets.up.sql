CREATE TABLE rifles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    make        TEXT NOT NULL,
    model       TEXT NOT NULL,
    calibre     TEXT NOT NULL DEFAULT '.177',
    power_ftlb  NUMERIC(5,2),               -- measured power output
    tune_notes  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rifles_user ON rifles (user_id);

CREATE TABLE pellets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand       TEXT NOT NULL,
    model       TEXT NOT NULL,
    head_size_mm NUMERIC(4,2),              -- e.g. 4.51
    weight_grains NUMERIC(5,2),
    batch_code  TEXT,
    notes       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pellets_user ON pellets (user_id);
