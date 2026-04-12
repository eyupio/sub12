-- Backfill existing personal cards (no league association) from 'pending' to 'verified'.
-- Personal cards have no verification workflow, so they should not be stuck as pending.
UPDATE score_cards
SET verification = 'verified', updated_at = NOW()
WHERE league_round_id IS NULL AND verification = 'pending';
