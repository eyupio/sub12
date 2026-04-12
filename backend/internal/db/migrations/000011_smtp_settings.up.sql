ALTER TABLE users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add CHECK constraint idempotently
DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE users
SET role = 'admin'
WHERE LOWER(email) = 'admin@sub12.local';

CREATE TABLE IF NOT EXISTS smtp_settings (
    id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    host                TEXT NOT NULL,
    port                INTEGER NOT NULL,
    username            TEXT,
    password_encrypted  TEXT,
    from_email          TEXT NOT NULL,
    from_name           TEXT,
    use_tls             BOOLEAN NOT NULL DEFAULT FALSE,
    use_starttls        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (port BETWEEN 1 AND 65535),
    CHECK (NOT (use_tls AND use_starttls))
);
