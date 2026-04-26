ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS custom_target_width_mm INT;

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS custom_target_height_mm INT;
