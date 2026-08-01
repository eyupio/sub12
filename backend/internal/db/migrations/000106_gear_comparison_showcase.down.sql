DROP INDEX IF EXISTS idx_score_cards_pellet;
DROP INDEX IF EXISTS idx_score_cards_rifle;
DROP INDEX IF EXISTS idx_pellets_model_key;
DROP INDEX IF EXISTS idx_rifles_model_key;

ALTER TABLE pellets DROP COLUMN IF EXISTS comparison_opt_in;
ALTER TABLE rifles  DROP COLUMN IF EXISTS comparison_opt_in;
