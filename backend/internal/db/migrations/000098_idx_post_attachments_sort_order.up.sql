-- Add composite index on (post_id, sort_order) to cover the ORDER BY sort_order ASC
-- clause in listAttachments.  The existing single-column index on post_id finds the
-- rows, but PostgreSQL then sorts them in memory.  A composite index lets the planner
-- return rows in order directly from the index, avoiding the extra sort step.
CREATE INDEX IF NOT EXISTS idx_post_attachments_post_order
    ON post_attachments (post_id, sort_order ASC);
