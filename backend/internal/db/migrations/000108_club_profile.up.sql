-- Real-world club profile: where the club is, how to reach it, what you can
-- shoot there, and how to join or visit. Everything is optional so existing
-- purely-online clubs keep working unchanged.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website_url      TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_email    TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_phone    TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS address_line1    TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS address_line2    TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS city             TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS region           TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS postcode         TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country          TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS latitude         DOUBLE PRECISION;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS longitude        DOUBLE PRECISION;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS disciplines      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS distances        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS facilities       TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_info  TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS visitor_policy   TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS established_year SMALLINT;

-- Coordinates are only meaningful as a pair and only for clubs that published
-- them, so the proximity index is partial.
CREATE INDEX IF NOT EXISTS idx_clubs_coords
    ON clubs (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Directory filtering by discipline is an array-containment lookup.
CREATE INDEX IF NOT EXISTS idx_clubs_disciplines ON clubs USING GIN (disciplines);

-- Directory search matches on club name and town.
CREATE INDEX IF NOT EXISTS idx_clubs_name_lower ON clubs (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_clubs_city_lower ON clubs (LOWER(city));
