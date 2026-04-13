DO $$ BEGIN
    CREATE TYPE attachment_type AS ENUM ('image', 'score_card', 'pellet_test');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS post_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    type        attachment_type NOT NULL,
    target_id   UUID,
    image_url   TEXT,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_attachments_post ON post_attachments(post_id);
