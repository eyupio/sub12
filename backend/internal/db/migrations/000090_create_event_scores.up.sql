-- Per-shot results. The (participant_id, lane, shot_number) tuple is unique;
-- offline scorecards UPSERT on this key, so re-syncs are idempotent. The
-- client_id column is a UUID generated on the device and acts as a secondary
-- idempotency key so a single client retry never produces a duplicate insert.
-- result is free text per discipline ('X', 'O', 'HIT', 'MISS', '2', '1', '0').

CREATE TABLE IF NOT EXISTS event_scores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,
    lane           INT NOT NULL,
    shot_number    INT NOT NULL DEFAULT 1,
    result         TEXT NOT NULL,
    note           TEXT NULL,
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by    UUID NOT NULL REFERENCES users(id),
    client_id      TEXT NOT NULL,
    UNIQUE (participant_id, lane, shot_number),
    UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_event_scores_participant
    ON event_scores (participant_id, lane, shot_number);
