-- Add edit-tracking column to score card comments (used by M2 comment editing)
ALTER TABLE score_card_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Indexes to speed up follower/following count queries and feed construction
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows (following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower  ON user_follows (follower_id);
