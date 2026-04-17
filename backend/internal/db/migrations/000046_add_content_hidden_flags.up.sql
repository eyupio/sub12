-- Soft-hide flags set by moderators. Hidden content returns 404 to non-authors;
-- authors see the content with a "Removed by moderators" banner.

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_hidden_at
    ON posts (hidden_at)
    WHERE hidden_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_hidden_at
    ON comments (hidden_at)
    WHERE hidden_at IS NOT NULL;
