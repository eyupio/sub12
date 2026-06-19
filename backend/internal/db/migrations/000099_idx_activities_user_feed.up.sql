-- Add a covering index for the "for you" feed query.
-- The existing idx_activities_user_type (user_id, type, created_at DESC) cannot
-- serve this query efficiently because the feed does not filter on type — the
-- extra column forces a full index scan instead of a range seek.
-- This index lets PostgreSQL do an efficient bitmap-OR merge across all
-- followed users ordered by created_at without reading unneeded type pages.
CREATE INDEX IF NOT EXISTS idx_activities_user_created ON activities (user_id, created_at DESC);
