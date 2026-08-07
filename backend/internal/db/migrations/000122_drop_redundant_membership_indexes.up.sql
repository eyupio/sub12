-- These four single-column indexes exactly duplicate the leading column of an
-- existing composite PRIMARY KEY on the same table. Postgres already uses the
-- leftmost prefix of a multicolumn B-tree index (the PK's implicit index) to
-- serve an equality lookup on that leading column alone, so each of these was
-- pure write overhead (maintained on every INSERT/DELETE/UPDATE) with no read
-- benefit. See CREATE TABLE ... PRIMARY KEY (<col>, ...) for each table below.
DROP INDEX IF EXISTS idx_user_follows_follower;   -- PK (follower_id, following_id)
DROP INDEX IF EXISTS idx_club_members_club_id;    -- PK (club_id, user_id)
DROP INDEX IF EXISTS idx_user_blocks_blocker;     -- PK (blocker_id, blocked_id)
DROP INDEX IF EXISTS idx_user_mutes_muter;        -- PK (muter_id, muted_id)
