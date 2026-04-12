CREATE TABLE email_templates (
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
        'Reset your Sub-12 password',
        '<p>Hello {{.display_name}},</p><p>Use this link to reset your password: <a href="{{.reset_link}}">Reset password</a>.</p>',
        'Hello {{.display_name}},\n\nUse this link to reset your password: {{.reset_link}}',
        TRUE
    ),
    (
        'welcome',
        'Welcome to Sub-12, {{.display_name}}!',
        '<p>Welcome to Sub-12, {{.display_name}}!</p><p>We\'re glad to have you.</p>',
        'Welcome to Sub-12, {{.display_name}}!\nWe\'re glad to have you.',
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
