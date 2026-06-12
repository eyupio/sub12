-- ⚡ Bolt: drop redundant non-unique index on (participant_id, lane, shot_number).
-- The UNIQUE constraint on these same columns already creates an implicit B-tree index
-- that the planner uses for all lookups on participant_id. Maintaining a second,
-- identical non-unique index doubles the write overhead for every event_scores
-- INSERT/UPDATE/DELETE with no read benefit.
DROP INDEX IF EXISTS idx_event_scores_participant;
