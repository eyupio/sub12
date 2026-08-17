-- Per-deployment identity: what this installation calls itself, how it is
-- coloured, and whether it is a community platform or one club's own site.
-- Singleton (id = 1), the same shape as smtp_settings and simulation_settings.
CREATE TABLE IF NOT EXISTS site_settings (
    id                  SMALLINT PRIMARY KEY DEFAULT 1,
    site_name           TEXT NOT NULL DEFAULT '',
    tagline             TEXT NOT NULL DEFAULT '',
    deployment_mode     TEXT NOT NULL DEFAULT 'community',
    primary_club_id     UUID REFERENCES clubs(id) ON DELETE SET NULL,
    logo_url            TEXT NOT NULL DEFAULT '',
    accent_light        TEXT NOT NULL DEFAULT '',
    accent_dark         TEXT NOT NULL DEFAULT '',
    default_theme       TEXT NOT NULL DEFAULT 'dark',
    allow_theme_toggle  BOOLEAN NOT NULL DEFAULT TRUE,
    welcome_heading     TEXT NOT NULL DEFAULT '',
    welcome_message     TEXT NOT NULL DEFAULT '',
    support_email       TEXT NOT NULL DEFAULT '',
    public_registration BOOLEAN NOT NULL DEFAULT TRUE,
    setup_completed_at  TIMESTAMPTZ,
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT site_settings_singleton CHECK (id = 1)
);

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- An existing deployment has already been set up by hand; the wizard is for
-- fresh installs only. Anything with a user in it is therefore stamped as
-- complete here, so upgrading never drops a running site onto a setup screen
-- that would refuse to create a second first-administrator anyway.
UPDATE site_settings
SET setup_completed_at = NOW()
WHERE setup_completed_at IS NULL
  AND EXISTS (SELECT 1 FROM users);
