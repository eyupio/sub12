ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_post_visibility_check;
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_post_visibility_check;

ALTER TABLE leagues DROP COLUMN IF EXISTS post_visibility;
ALTER TABLE clubs DROP COLUMN IF EXISTS post_visibility;
