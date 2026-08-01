DROP INDEX IF EXISTS idx_feature_request_events_feature_created;
DROP TABLE IF EXISTS feature_request_events;

ALTER TABLE feature_requests
    DROP CONSTRAINT IF EXISTS feature_requests_priority_check;

ALTER TABLE feature_requests
    DROP COLUMN IF EXISTS priority;
