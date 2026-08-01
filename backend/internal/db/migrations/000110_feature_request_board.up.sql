-- Feature board: an explicit priority the roadmap can sort and group by, and a
-- durable history of every state change so the board can show why an idea moved.
ALTER TABLE feature_requests
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE feature_requests
    DROP CONSTRAINT IF EXISTS feature_requests_priority_check;

ALTER TABLE feature_requests
    ADD CONSTRAINT feature_requests_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE TABLE IF NOT EXISTS feature_request_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_request_events_feature_created
    ON feature_request_events (feature_request_id, created_at ASC);

-- Seed a creation event for requests that predate the history table so their
-- timeline starts somewhere rather than appearing to have no past.
INSERT INTO feature_request_events (feature_request_id, actor_id, event_type, to_value, created_at)
SELECT fr.id, fr.owner_admin_id, 'created', fr.status, fr.created_at
FROM feature_requests fr
WHERE NOT EXISTS (
    SELECT 1 FROM feature_request_events e WHERE e.feature_request_id = fr.id
);
