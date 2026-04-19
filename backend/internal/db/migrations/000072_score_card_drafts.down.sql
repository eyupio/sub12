DROP INDEX IF EXISTS idx_score_cards_drafts;
ALTER TABLE score_cards DROP COLUMN IF EXISTS is_draft;
