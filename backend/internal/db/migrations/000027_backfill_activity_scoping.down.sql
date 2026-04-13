-- Backfill is not reversible; nulling out is safe since the columns are nullable
UPDATE activities SET league_id = NULL WHERE league_id IS NOT NULL;
