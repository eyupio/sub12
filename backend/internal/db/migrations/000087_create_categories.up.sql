-- Platform-wide participant categories. Currently consumed by Live Events but
-- modelled as a master table so future features (leagues, profiles) can reuse
-- the same canonical labels. Slugs are stable and used in API payloads;
-- labels are display-only and may be edited via admin CRUD.

CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_active_sort
    ON categories (is_active, sort_order, label);

INSERT INTO categories (slug, label, sort_order) VALUES
    ('open',     'Open',      10),
    ('pcp',      'PCP',       20),
    ('springer', 'Springer',  30),
    ('lady',     'Lady',      40),
    ('veteran',  'Veteran',   50),
    ('junior',   'Junior',    60),
    ('stick',    'Stick',     70),
    ('rimfire',  '.22',       80)
ON CONFLICT (slug) DO NOTHING;
