-- User-submitted reports of content or users for moderation review.

CREATE TABLE IF NOT EXISTS reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    target_type  TEXT NOT NULL,
    target_id    UUID NOT NULL,
    reason       TEXT NOT NULL,
    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    decided_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_target_type_check
        CHECK (target_type IN ('post', 'comment', 'user', 'score_card'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_status_check
        CHECK (status IN ('open', 'dismissed', 'actioned'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
    ON reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_target
    ON reports (target_type, target_id);
