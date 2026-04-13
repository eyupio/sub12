ALTER TABLE activities ADD COLUMN IF NOT EXISTS league_id UUID;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS club_id UUID;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

-- Partial indexes for scoped feed queries
CREATE INDEX IF NOT EXISTS idx_activities_league ON activities (league_id, created_at DESC) WHERE league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_club ON activities (club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_public ON activities (created_at DESC) WHERE visibility = 'public';
