-- Add star_level to users (computed from achievement count, updated on award).
ALTER TABLE users ADD COLUMN IF NOT EXISTS star_level SMALLINT NOT NULL DEFAULT 0;

-- New social/activity achievement definitions.
INSERT INTO achievement_defs (id, name, description, icon) VALUES
    ('fan_favourite',      'Fan Favourite',      'Your content received 10 likes',         'heart'),
    ('community_champion', 'Community Champion', 'Your content received 25 likes',         'trophy'),
    ('super_liker',        'Super Liker',        'Liked 25 items',                         'thumbs-up'),
    ('league_veteran',     'League Veteran',     'Competed in 5 league rounds',            'shield'),
    ('pellet_expert',      'Pellet Expert',      'Completed 5 pellet test sessions',       'flask-conical'),
    ('top_shooter',        'Top Shooter',        'Posted 25 score cards',                  'crosshair')
ON CONFLICT (id) DO NOTHING;
