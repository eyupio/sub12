-- Backfill league_id on score activities from score_card → round → season → league
UPDATE activities a
SET league_id = (
    SELECT l.id
    FROM score_cards sc
    JOIN rounds r ON r.id = sc.league_round_id
    JOIN seasons s ON s.id = r.season_id
    JOIN leagues l ON l.id = s.league_id
    WHERE sc.id = a.target_id
)
WHERE a.type IN ('score_posted', 'personal_best')
  AND a.target_type = 'score_card'
  AND a.league_id IS NULL;

-- Backfill league_id on joined_league activities (target_id IS the league)
UPDATE activities
SET league_id = target_id
WHERE type = 'joined_league'
  AND target_type = 'league'
  AND league_id IS NULL;
