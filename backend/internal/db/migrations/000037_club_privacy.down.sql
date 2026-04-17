DROP TABLE IF EXISTS club_join_requests;

ALTER TABLE clubs DROP COLUMN IF EXISTS join_policy;
ALTER TABLE clubs DROP COLUMN IF EXISTS type;

DROP TYPE IF EXISTS club_join_policy;
DROP TYPE IF EXISTS club_type;
