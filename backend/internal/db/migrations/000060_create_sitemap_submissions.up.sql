-- Track admin-initiated sitemap ping submissions to search engines.
CREATE TABLE IF NOT EXISTS sitemap_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine          TEXT        NOT NULL,           -- e.g. "google", "bing", "indexnow"
    url             TEXT        NOT NULL,           -- the ping URL that was called
    status_code     SMALLINT,                       -- HTTP response status (NULL if network error)
    response_body   TEXT,                           -- first 2 KB of response body
    error           TEXT,                           -- error message if the request failed
    submitted_by    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sitemap_submissions_created
    ON sitemap_submissions (created_at DESC);
