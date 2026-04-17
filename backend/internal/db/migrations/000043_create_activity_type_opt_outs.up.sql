-- Finer-grained feed opt-out: hide activities of a given type from a user's feed.
-- activity_type values align with activities.type (score_posted, personal_best, etc).

CREATE TABLE IF NOT EXISTS activity_type_opt_outs (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_type)
);
