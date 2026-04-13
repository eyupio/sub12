CREATE TABLE IF NOT EXISTS posts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    league_id     UUID REFERENCES leagues(id) ON DELETE CASCADE,
    club_id       UUID REFERENCES clubs(id) ON DELETE CASCADE,
    like_count    INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_league ON posts(league_id, created_at DESC) WHERE league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_club ON posts(club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
