-- Human-readable share slugs for the named shareable entities.
--
-- Share links previously carried a raw UUID (/share/users/bb2c625d-6dc4-…),
-- which reads badly in a social post next to the preview card. Users, leagues
-- and clubs have stable human names, so they get a slug derived from that name.
-- Score cards and pellet tests keep their UUIDs — a card has no stable name.
--
-- share_slug_aliases is the resolution table and holds *every* slug ever
-- assigned, including each entity's current one. That makes its primary key
-- the single uniqueness constraint: a renamed entity's old slug keeps
-- resolving (links already shared don't rot) and can never be handed to a
-- different entity later.

ALTER TABLE users   ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE clubs   ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE TABLE IF NOT EXISTS share_slug_aliases (
    entity_type TEXT        NOT NULL,
    slug        TEXT        NOT NULL,
    entity_id   UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, slug)
);

CREATE INDEX IF NOT EXISTS share_slug_aliases_entity_idx
    ON share_slug_aliases (entity_type, entity_id);

-- Backfill. Looping in PL/pgSQL rather than a set-based UPDATE with
-- row_number(): a name that already slugifies to "paul-2" would collide with
-- the disambiguating suffix generated for a second "paul", and the loop is
-- provably correct where the window function is only probably correct.
-- Guarded on slug IS NULL so a re-run is a no-op.
DO $$
DECLARE
    r         RECORD;
    base      TEXT;
    candidate TEXT;
    n         INT;
BEGIN
    FOR r IN
        SELECT id, display_name AS name FROM users   WHERE slug IS NULL
        ORDER BY created_at, id
    LOOP
        base := NULLIF(trim(both '-' FROM regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9]+', '-', 'g')), '');
        base := left(coalesce(base, 'shooter'), 60);
        candidate := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM share_slug_aliases WHERE entity_type = 'user' AND slug = candidate) LOOP
            n := n + 1;
            candidate := base || '-' || n;
        END LOOP;
        UPDATE users SET slug = candidate WHERE id = r.id;
        INSERT INTO share_slug_aliases (entity_type, slug, entity_id)
        VALUES ('user', candidate, r.id) ON CONFLICT DO NOTHING;
    END LOOP;

    FOR r IN
        SELECT id, name FROM leagues WHERE slug IS NULL
        ORDER BY created_at, id
    LOOP
        base := NULLIF(trim(both '-' FROM regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9]+', '-', 'g')), '');
        base := left(coalesce(base, 'league'), 60);
        candidate := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM share_slug_aliases WHERE entity_type = 'league' AND slug = candidate) LOOP
            n := n + 1;
            candidate := base || '-' || n;
        END LOOP;
        UPDATE leagues SET slug = candidate WHERE id = r.id;
        INSERT INTO share_slug_aliases (entity_type, slug, entity_id)
        VALUES ('league', candidate, r.id) ON CONFLICT DO NOTHING;
    END LOOP;

    FOR r IN
        SELECT id, name FROM clubs WHERE slug IS NULL
        ORDER BY created_at, id
    LOOP
        base := NULLIF(trim(both '-' FROM regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9]+', '-', 'g')), '');
        base := left(coalesce(base, 'club'), 60);
        candidate := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM share_slug_aliases WHERE entity_type = 'club' AND slug = candidate) LOOP
            n := n + 1;
            candidate := base || '-' || n;
        END LOOP;
        UPDATE clubs SET slug = candidate WHERE id = r.id;
        INSERT INTO share_slug_aliases (entity_type, slug, entity_id)
        VALUES ('club', candidate, r.id) ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Enforced after the backfill so the migration can't half-apply. Slugs stay
-- nullable at the column level: a row is only ever slug-less between INSERT
-- and the claim that immediately follows it.
CREATE UNIQUE INDEX IF NOT EXISTS users_slug_key   ON users   (slug);
CREATE UNIQUE INDEX IF NOT EXISTS leagues_slug_key ON leagues (slug);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_slug_key   ON clubs   (slug);
