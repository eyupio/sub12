DROP INDEX IF EXISTS users_slug_key;
DROP INDEX IF EXISTS leagues_slug_key;
DROP INDEX IF EXISTS clubs_slug_key;

DROP INDEX IF EXISTS share_slug_aliases_entity_idx;
DROP TABLE IF EXISTS share_slug_aliases;

ALTER TABLE users   DROP COLUMN IF EXISTS slug;
ALTER TABLE leagues DROP COLUMN IF EXISTS slug;
ALTER TABLE clubs   DROP COLUMN IF EXISTS slug;
