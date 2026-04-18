CREATE TABLE IF NOT EXISTS feature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    refined_description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    owner_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT feature_requests_status_check
        CHECK (status IN ('submitted', 'refining', 'accepted', 'rejected', 'planned', 'in_progress', 'done'))
);

CREATE TABLE IF NOT EXISTS feature_request_votes (
    feature_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (feature_request_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status_updated
    ON feature_requests (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_requests_owner
    ON feature_requests (owner_admin_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_request_votes_feature_created
    ON feature_request_votes (feature_request_id, created_at DESC);
