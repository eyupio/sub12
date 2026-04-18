UPDATE email_templates
SET subject_template = 'Reset your sub12.io password',
    updated_at = NOW()
WHERE key = 'forgot_password'
  AND subject_template = 'Reset your Sub-12 password';

UPDATE email_templates
SET subject_template = 'Welcome to sub12.io, {{.display_name}}!',
    html_template = '<p>Welcome to sub12.io, {{.display_name}}!</p><p>We''re glad to have you.</p>',
    text_template = E'Welcome to sub12.io, {{.display_name}}!\nWe''re glad to have you.',
    updated_at = NOW()
WHERE key = 'welcome'
  AND subject_template = 'Welcome to Sub-12, {{.display_name}}!'
  AND html_template = '<p>Welcome to Sub-12, {{.display_name}}!</p><p>We''re glad to have you.</p>'
  AND text_template = E'Welcome to Sub-12, {{.display_name}}!\nWe''re glad to have you.';

UPDATE email_templates
SET subject_template = 'Confirm your new sub12.io email address',
    updated_at = NOW()
WHERE key = 'email_change_confirm'
  AND subject_template = 'Confirm your new Sub-12 email address';

UPDATE email_templates
SET subject_template = '[sub12.io] New report in {{.community_name}}',
    html_template = '<p>Hi {{.display_name}},</p><p>A member of {{.community_name}} has flagged {{.target_label}} for review.</p><p>Reason: <strong>{{.reason}}</strong></p><p><a href="{{.report_link}}">Open the report</a></p><p>— sub12.io Moderation</p>',
    text_template = E'Hi {{.display_name}},\n\nA member of {{.community_name}} has flagged {{.target_label}} for review.\n\nReason: {{.reason}}\n\nOpen the report: {{.report_link}}\n\n— sub12.io Moderation\n',
    updated_at = NOW()
WHERE key = 'notification_report_filed'
  AND subject_template = '[Sub-12] New report in {{.community_name}}'
  AND html_template = '<p>Hi {{.display_name}},</p><p>A member of {{.community_name}} has flagged {{.target_label}} for review.</p><p>Reason: <strong>{{.reason}}</strong></p><p><a href="{{.report_link}}">Open the report</a></p><p>— Sub-12 Moderation</p>'
  AND text_template = E'Hi {{.display_name}},\n\nA member of {{.community_name}} has flagged {{.target_label}} for review.\n\nReason: {{.reason}}\n\nOpen the report: {{.report_link}}\n\n— Sub-12 Moderation\n';
