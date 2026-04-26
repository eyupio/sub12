-- Community review requests for personal practice score cards.
-- A card owner can request peer review; reviewers reuse the existing
-- score_confirmations table. Once required_confirmations is reached the
-- card auto-flips to verification='verified'.
CREATE TABLE IF NOT EXISTS community_review_requests (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_card_id            UUID NOT NULL UNIQUE REFERENCES score_cards(id) ON DELETE CASCADE,
    requested_by             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    required_confirmations   SMALLINT NOT NULL DEFAULT 3,
    status                   TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','verified','cancelled')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_community_review_status_created
    ON community_review_requests (status, created_at DESC);

INSERT INTO achievement_defs (id, name, description, icon) VALUES
    ('first_review',        'First Review',        'Confirmed your first community review request', 'shield-check'),
    ('community_reviewer',  'Community Reviewer',  'Confirmed 10 community review requests',        'gavel'),
    ('peer_judge',          'Peer Judge',          'Confirmed 25 community review requests',        'scale'),
    ('helpful_reviewer',    'Helpful Reviewer',    'Confirmed a review request within 24 hours',    'zap')
ON CONFLICT (id) DO NOTHING;
