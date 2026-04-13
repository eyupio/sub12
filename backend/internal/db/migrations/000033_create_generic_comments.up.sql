-- Generic comments table supporting multiple target types and threading
CREATE TABLE IF NOT EXISTS comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL,
    target_type TEXT NOT NULL,      -- 'score_card', 'post'
    parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    like_count  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_id, target_type, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- Migrate existing score_card_comments data
INSERT INTO comments (id, user_id, target_id, target_type, body, created_at, updated_at)
SELECT id, user_id, card_id, 'score_card', body, created_at, updated_at
FROM score_card_comments
ON CONFLICT (id) DO NOTHING;
