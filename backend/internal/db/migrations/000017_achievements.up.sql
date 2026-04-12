CREATE TABLE IF NOT EXISTS achievement_defs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES achievement_defs(id),
    earned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id, earned_at DESC);

INSERT INTO achievement_defs VALUES
    ('first_card',    'First Card',     'Logged your first score card',        'target'),
    ('century',       'Century',        'Scored 100+ in a single card',        'star'),
    ('perfect_score', 'Perfect Score',  'Scored 250 (25×10)',                  'award'),
    ('sharp_eye',     'Sharp Eye',      '5+ X''s in a single card',           'eye'),
    ('sharpshooter',  'Sharpshooter',   '10+ X''s in a single card',          'crosshair'),
    ('dedicated',     'Dedicated',      'Logged 10+ score cards',             'calendar'),
    ('league_debut',  'League Debut',   'Submitted your first league score',  'trophy')
ON CONFLICT DO NOTHING;
