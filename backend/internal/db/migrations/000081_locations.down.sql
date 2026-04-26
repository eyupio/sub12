ALTER TABLE pellet_test_sessions DROP COLUMN IF EXISTS location_id;
ALTER TABLE score_cards DROP COLUMN IF EXISTS location_id;
DROP INDEX IF EXISTS idx_locations_user_id;
DROP TABLE IF EXISTS locations;
