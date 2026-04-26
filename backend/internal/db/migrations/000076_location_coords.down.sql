ALTER TABLE pellet_test_sessions DROP COLUMN IF EXISTS location_lng;
ALTER TABLE pellet_test_sessions DROP COLUMN IF EXISTS location_lat;

ALTER TABLE score_cards DROP COLUMN IF EXISTS location_lng;
ALTER TABLE score_cards DROP COLUMN IF EXISTS location_lat;
