DROP INDEX IF EXISTS idx_leagues_club_id;
ALTER TABLE leagues DROP COLUMN IF EXISTS club_id;
