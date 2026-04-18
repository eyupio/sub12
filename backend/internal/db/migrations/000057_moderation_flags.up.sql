-- League/club-scoped moderation: admins can flag a comment or post to prompt
-- the author to amend it. Flagged content stays visible but is rendered with
-- a moderation banner by the frontend; a periodic sweeper promotes un-amended
-- flagged rows to hidden_at after a grace window.

ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS flagged_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS flagged_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS flag_reason   TEXT,
    ADD COLUMN IF NOT EXISTS flag_scope    TEXT,
    ADD COLUMN IF NOT EXISTS flag_scope_id UUID;

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS flagged_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS flagged_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS flag_reason   TEXT,
    ADD COLUMN IF NOT EXISTS flag_scope    TEXT,
    ADD COLUMN IF NOT EXISTS flag_scope_id UUID;

DO $$ BEGIN
    ALTER TABLE comments
        ADD CONSTRAINT comments_flag_scope_check
        CHECK (flag_scope IS NULL OR flag_scope IN ('league','club','global'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE posts
        ADD CONSTRAINT posts_flag_scope_check
        CHECK (flag_scope IS NULL OR flag_scope IN ('league','club','global'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_flagged_at
    ON comments (flagged_at)
    WHERE flagged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_flagged_at
    ON posts (flagged_at)
    WHERE flagged_at IS NOT NULL;
