DELETE FROM achievement_defs WHERE id IN (
    'first_review', 'community_reviewer', 'peer_judge', 'helpful_reviewer'
);

DROP INDEX IF EXISTS idx_community_review_status_created;
DROP TABLE IF EXISTS community_review_requests;
