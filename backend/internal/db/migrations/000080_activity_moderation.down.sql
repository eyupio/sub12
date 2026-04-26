-- Revert reports.target_type CHECK to its prior set.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_target_type_check
        CHECK (target_type IN ('post', 'comment', 'user', 'score_card'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_activities_hidden_at;

ALTER TABLE activities DROP COLUMN IF EXISTS hide_reason;
ALTER TABLE activities DROP COLUMN IF EXISTS hidden_by;
ALTER TABLE activities DROP COLUMN IF EXISTS hidden_at;
