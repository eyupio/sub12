CREATE TABLE IF NOT EXISTS email_templates (
    key               TEXT PRIMARY KEY,
    subject_template  TEXT NOT NULL,
    html_template     TEXT NOT NULL,
    text_template     TEXT NOT NULL,
    is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO email_templates (key, subject_template, html_template, text_template, is_enabled)
VALUES
    (
        'forgot_password',
        'Reset your sub12.io password',
        '<p>Hello {{.display_name}},</p><p>Use this link to reset your password: <a href="{{.reset_link}}">Reset password</a>.</p>',
        E'Hello {{.display_name}},\n\nUse this link to reset your password: {{.reset_link}}',
        TRUE
    ),
    (
        'welcome',
        'Welcome to sub12.io, {{.display_name}}!',
        '<p>Welcome to sub12.io, {{.display_name}}!</p><p>We''re glad to have you.</p>',
        E'Welcome to sub12.io, {{.display_name}}!\nWe''re glad to have you.',
        TRUE
    ),
    (
        'notification_generic',
        '{{.notification_title}}',
        '<p>{{.notification_body}}</p>',
        '{{.notification_body}}',
        TRUE
    )
ON CONFLICT (key) DO NOTHING;
