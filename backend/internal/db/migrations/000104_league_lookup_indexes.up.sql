-- Hot-path indexes for league reads.
--
-- league_members is keyed on (league_id, user_id), so "which leagues is this
-- user in?" (the /users/me/leagues query, and the membership joins behind
-- every league rank lookup) had no usable index and fell back to a scan.
CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members (user_id);

-- Standings, league score lists and the score-count tally all walk
-- score_cards by league_round_id; only the FK existed, without an index.
CREATE INDEX IF NOT EXISTS idx_score_cards_league_round
    ON score_cards (league_round_id)
    WHERE league_round_id IS NOT NULL;

-- seasons are always looked up by their parent league.
CREATE INDEX IF NOT EXISTS idx_seasons_league ON seasons (league_id);

-- rounds are always looked up by their parent season.
CREATE INDEX IF NOT EXISTS idx_rounds_season ON rounds (season_id);
