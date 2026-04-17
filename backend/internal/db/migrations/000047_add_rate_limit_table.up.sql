-- Persistent fallback token-bucket state for the rate-limit middleware when
-- Redis is unavailable. Production path still uses Redis for hot keys.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket      TEXT NOT NULL,
    key         TEXT NOT NULL,
    tokens      INTEGER NOT NULL,
    refilled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket, key)
);
