-- Weekly opening / range session times for a club. Multiple rows per day are
-- allowed so a club can publish split sessions (e.g. a morning and an evening
-- slot). day_of_week is 0 = Monday through 6 = Sunday.

CREATE TABLE IF NOT EXISTS club_opening_hours (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    opens_at    TIME,
    closes_at   TIME,
    is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_opening_hours_club
    ON club_opening_hours (club_id, day_of_week, opens_at);
