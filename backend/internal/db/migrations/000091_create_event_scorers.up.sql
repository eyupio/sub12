-- Delegated scorer rights. The event owner is implicitly a scorer; this table
-- only stores delegates (typically range officers). Permission checks resolve
-- as: owner OR row exists.

CREATE TABLE IF NOT EXISTS event_scorers (
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_scorers_user
    ON event_scorers (user_id);
