-- Audit trail of moderator decisions. Preserved even if the report row is
-- later purged.

CREATE TABLE IF NOT EXISTS content_moderation_actions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id  UUID REFERENCES reports(id) ON DELETE SET NULL,
    admin_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE content_moderation_actions
        ADD CONSTRAINT cma_action_check
        CHECK (action IN ('hide', 'warn_user', 'no_action'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cma_report ON content_moderation_actions (report_id);
CREATE INDEX IF NOT EXISTS idx_cma_admin  ON content_moderation_actions (admin_id, created_at DESC);
