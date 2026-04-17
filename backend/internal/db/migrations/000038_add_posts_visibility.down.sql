DROP INDEX IF EXISTS idx_posts_visibility;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;

ALTER TABLE posts DROP COLUMN IF EXISTS visibility;
