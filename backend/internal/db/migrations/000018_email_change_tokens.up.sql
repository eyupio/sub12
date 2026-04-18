CREATE TABLE IF NOT EXISTS email_change_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email  TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_change_tokens_token_hash ON email_change_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_change_tokens_expires_at ON email_change_tokens(expires_at);

INSERT INTO email_templates (key, subject_template, html_template, text_template, is_enabled)
VALUES
    (
        'email_change_confirm',
        'Confirm your new sub12.io email address',
        '<p>Hello {{.display_name}},</p><p>You requested to change your email address to this one. Click the link below to confirm:</p><p><a href="{{.confirm_link}}">Confirm email change</a></p><p>This link expires at {{.expires_at}}. If you did not request this change, you can safely ignore this email.</p>',
        E'Hello {{.display_name}},\n\nYou requested to change your email address to this one. Use this link to confirm:\n\n{{.confirm_link}}\n\nThis link expires at {{.expires_at}}. If you did not request this change, you can safely ignore this email.',
        TRUE
    )
ON CONFLICT (key) DO NOTHING;
