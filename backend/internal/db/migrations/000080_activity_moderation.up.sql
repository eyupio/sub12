-- Activity moderation: lets site admins hide activity feed entries and accept
-- activities as report targets so the existing report flow notifies the
-- owning league/club admins.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS hidden_at  TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS hidden_by  UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS hide_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_hidden_at
    ON activities (hidden_at)
    WHERE hidden_at IS NOT NULL;

-- Broaden the reports.target_type CHECK to include 'activity'.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_target_type_check
        CHECK (target_type IN ('post', 'comment', 'user', 'score_card', 'activity'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
