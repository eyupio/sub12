-- Denormalized like and comment counts on score_cards.
ALTER TABLE score_cards ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;
ALTER TABLE score_cards ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0;
