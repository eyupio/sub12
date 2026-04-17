DROP INDEX IF EXISTS idx_comments_hidden_at;
DROP INDEX IF EXISTS idx_posts_hidden_at;
ALTER TABLE comments DROP COLUMN IF EXISTS hidden_at;
ALTER TABLE posts    DROP COLUMN IF EXISTS hidden_at;
