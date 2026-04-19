DROP INDEX IF EXISTS idx_pts_drafts;
ALTER TABLE pellet_test_sessions DROP COLUMN IF EXISTS is_draft;
