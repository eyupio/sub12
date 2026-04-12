-- Pellet Testing feature: sessions, groups, and images

CREATE TABLE pellet_test_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rifle_id              UUID NOT NULL REFERENCES rifles(id) ON DELETE CASCADE,
    pellet_id             UUID NOT NULL REFERENCES pellets(id) ON DELETE CASCADE,
    test_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    distance_m            NUMERIC(6,2) NOT NULL,
    distance_unit         TEXT NOT NULL DEFAULT 'meters',
    location              TEXT,
    wind_mph              NUMERIC(5,2),
    temp_celsius          NUMERIC(5,2),
    humidity_pct          NUMERIC(5,2),
    notes                 TEXT,
    average_group_size_mm NUMERIC(8,3),
    best_group_size_mm    NUMERIC(8,3),
    group_count           INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pts_user     ON pellet_test_sessions (user_id);
CREATE INDEX idx_pts_rifle    ON pellet_test_sessions (rifle_id);
CREATE INDEX idx_pts_pellet   ON pellet_test_sessions (pellet_id);
CREATE INDEX idx_pts_rifle_pellet ON pellet_test_sessions (rifle_id, pellet_id);

CREATE TABLE pellet_test_groups (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES pellet_test_sessions(id) ON DELETE CASCADE,
    group_number  INTEGER NOT NULL,
    shot_count    INTEGER NOT NULL DEFAULT 5,
    group_size_mm NUMERIC(8,3) NOT NULL,
    group_size_moa NUMERIC(8,4),
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, group_number)
);

CREATE INDEX idx_ptg_session ON pellet_test_groups (session_id);

CREATE TABLE pellet_test_images (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES pellet_test_sessions(id) ON DELETE CASCADE,
    group_id   UUID REFERENCES pellet_test_groups(id) ON DELETE SET NULL,
    image_id   UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    caption    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pti_session ON pellet_test_images (session_id);
