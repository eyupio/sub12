-- Revert personal cards back to 'pending'.
UPDATE score_cards
SET verification = 'pending', updated_at = NOW()
WHERE league_round_id IS NULL AND verification = 'verified';
