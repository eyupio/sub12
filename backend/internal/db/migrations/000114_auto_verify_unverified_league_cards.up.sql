-- League cards are created 'pending', but a league that never enabled
-- require_score_verification has no way to flip them to 'verified' — peer
-- confirmation is refused and standings only count verified cards, so every
-- submission was stranded outside the table. Mirror what migration 000012 did
-- for personal cards: verify pending, non-draft cards in leagues where
-- verification is switched off. The service layer now keeps this invariant for
-- new submissions and when the config toggle changes.
UPDATE score_cards sc
SET verification = 'verified', updated_at = NOW()
FROM rounds rd
JOIN seasons s   ON s.id = rd.season_id
JOIN league_configs lc ON lc.league_id = s.league_id
WHERE sc.league_round_id = rd.id
  AND sc.verification = 'pending'
  AND sc.is_draft = FALSE
  AND lc.require_score_verification = FALSE;
