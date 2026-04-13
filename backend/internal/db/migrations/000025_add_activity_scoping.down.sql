DROP INDEX IF EXISTS idx_activities_public;
DROP INDEX IF EXISTS idx_activities_club;
DROP INDEX IF EXISTS idx_activities_league;

ALTER TABLE activities DROP COLUMN IF EXISTS visibility;
ALTER TABLE activities DROP COLUMN IF EXISTS club_id;
ALTER TABLE activities DROP COLUMN IF EXISTS league_id;
