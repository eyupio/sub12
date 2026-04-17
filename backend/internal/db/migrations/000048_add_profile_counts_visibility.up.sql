-- Let private profiles also hide their follower/following counts from
-- non-followers. Default true preserves the existing behaviour.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS show_follower_counts BOOLEAN NOT NULL DEFAULT TRUE;
