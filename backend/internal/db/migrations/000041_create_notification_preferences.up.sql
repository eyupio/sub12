-- Per-user notification preferences. One row per user; missing row = all defaults true.

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    follow_request       BOOLEAN NOT NULL DEFAULT TRUE,
    follow_accepted      BOOLEAN NOT NULL DEFAULT TRUE,
    comment_on_my_card   BOOLEAN NOT NULL DEFAULT TRUE,
    reply_to_my_comment  BOOLEAN NOT NULL DEFAULT TRUE,
    like_on_my_content   BOOLEAN NOT NULL DEFAULT TRUE,
    score_verified       BOOLEAN NOT NULL DEFAULT TRUE,
    score_rejected       BOOLEAN NOT NULL DEFAULT TRUE,
    score_amended        BOOLEAN NOT NULL DEFAULT TRUE,
    league_join_approved BOOLEAN NOT NULL DEFAULT TRUE,
    club_join_approved   BOOLEAN NOT NULL DEFAULT TRUE,
    mention              BOOLEAN NOT NULL DEFAULT TRUE,
    digest_email         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
