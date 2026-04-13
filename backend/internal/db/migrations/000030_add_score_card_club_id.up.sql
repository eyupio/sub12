-- Add optional club_id to score_cards for club-scoped submissions.
ALTER TABLE score_cards ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_score_cards_club_id ON score_cards(club_id) WHERE club_id IS NOT NULL;
