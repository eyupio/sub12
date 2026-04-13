-- Add optional club_id to leagues, allowing a league to be hosted by a club.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leagues_club_id ON leagues(club_id) WHERE club_id IS NOT NULL;
