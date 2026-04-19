-- Quick-capture drafts: a score card saved in the field with just rifle,
-- pellet, and photo (shots/metadata filled in later). Drafts are excluded
-- from standings, stats, leaderboards, activity, and personal-best evaluation
-- until the user "graduates" them via the refine flow.

ALTER TABLE score_cards
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index drives the Drafts dashboard list; keeps the main index hot
-- for completed-card queries.
CREATE INDEX IF NOT EXISTS idx_score_cards_drafts
    ON score_cards (user_id, created_at DESC)
    WHERE is_draft;
