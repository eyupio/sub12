DROP INDEX IF EXISTS idx_score_cards_club_id;
ALTER TABLE score_cards DROP COLUMN IF EXISTS club_id;
