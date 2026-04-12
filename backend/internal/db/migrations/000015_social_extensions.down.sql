DROP INDEX IF EXISTS idx_user_follows_following;
DROP INDEX IF EXISTS idx_user_follows_follower;
ALTER TABLE score_card_comments DROP COLUMN IF EXISTS updated_at;
