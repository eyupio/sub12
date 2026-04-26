ALTER TABLE score_cards
    ADD COLUMN IF NOT EXISTS card_image_rotation INT NOT NULL DEFAULT 0;
