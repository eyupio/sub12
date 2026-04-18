DROP INDEX IF EXISTS idx_posts_flagged_at;
DROP INDEX IF EXISTS idx_comments_flagged_at;

DO $$ BEGIN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_flag_scope_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_flag_scope_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE posts
    DROP COLUMN IF EXISTS flag_scope_id,
    DROP COLUMN IF EXISTS flag_scope,
    DROP COLUMN IF EXISTS flag_reason,
    DROP COLUMN IF EXISTS flagged_by,
    DROP COLUMN IF EXISTS flagged_at;

ALTER TABLE comments
    DROP COLUMN IF EXISTS flag_scope_id,
    DROP COLUMN IF EXISTS flag_scope,
    DROP COLUMN IF EXISTS flag_reason,
    DROP COLUMN IF EXISTS flagged_by,
    DROP COLUMN IF EXISTS flagged_at;
