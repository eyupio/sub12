ALTER TABLE feature_requests
    DROP CONSTRAINT IF EXISTS feature_requests_status_check;

ALTER TABLE feature_requests
    ADD CONSTRAINT feature_requests_status_check
    CHECK (status IN ('submitted', 'refining', 'accepted', 'rejected', 'planned', 'in_progress', 'done', 'implemented'));
