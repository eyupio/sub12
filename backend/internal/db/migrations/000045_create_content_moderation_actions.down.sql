DROP INDEX IF EXISTS idx_cma_admin;
DROP INDEX IF EXISTS idx_cma_report;
ALTER TABLE IF EXISTS content_moderation_actions DROP CONSTRAINT IF EXISTS cma_action_check;
DROP TABLE IF EXISTS content_moderation_actions;
