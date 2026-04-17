-- Posts: explicit visibility column.
-- 'inherit' preserves existing behaviour (scope from league/club); other values
-- gate independently: public is globally readable, followers only to followers
-- of the author, members only to members of the parent league/club, private to
-- the author alone.

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'inherit';

DO $$ BEGIN
    ALTER TABLE posts
        ADD CONSTRAINT posts_visibility_check
        CHECK (visibility IN ('public', 'followers', 'members', 'private', 'inherit'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts (visibility);
