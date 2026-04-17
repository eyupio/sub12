-- In-app notifications: one row per event delivered to a recipient.
-- target_id / target_type are polymorphic (score_card, comment, post, user, league, club).

CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    type         TEXT NOT NULL,
    target_id    UUID,
    target_type  TEXT,
    league_id    UUID REFERENCES leagues(id) ON DELETE CASCADE,
    club_id      UUID REFERENCES clubs(id)   ON DELETE CASCADE,
    metadata     JSONB,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
    ON notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON notifications (recipient_id)
    WHERE read_at IS NULL;
