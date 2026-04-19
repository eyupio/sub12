-- Quick-capture drafts for bench-rest / pellet-testing sessions. Saved in
-- the field with just rifle, pellet, and photo; distance, groups, and
-- measurements are added during the refine flow. Drafts are excluded from
-- leaderboards, stats, comparison, timeline, confidence, and batch reports.

ALTER TABLE pellet_test_sessions
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pts_drafts
    ON pellet_test_sessions (user_id, created_at DESC)
    WHERE is_draft;
