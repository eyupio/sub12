-- Admin-controlled post visibility override for leagues and clubs.
-- The group admin decides whether posts inside the league/club are visible to
-- members only or to the broader public. Individual users' privacy settings
-- (feed_opt_out, profile_visibility) still further restrict whether their
-- activity surfaces on the public feed.

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS post_visibility TEXT NOT NULL DEFAULT 'members';

ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS post_visibility TEXT NOT NULL DEFAULT 'members';

DO $$ BEGIN
    ALTER TABLE leagues
        ADD CONSTRAINT leagues_post_visibility_check
        CHECK (post_visibility IN ('members', 'public'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE clubs
        ADD CONSTRAINT clubs_post_visibility_check
        CHECK (post_visibility IN ('members', 'public'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
