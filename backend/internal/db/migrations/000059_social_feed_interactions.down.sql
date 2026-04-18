DELETE FROM achievement_defs WHERE id IN (
    'fan_favourite', 'community_champion', 'super_liker',
    'league_veteran', 'pellet_expert', 'top_shooter'
);

ALTER TABLE users DROP COLUMN IF EXISTS star_level;
