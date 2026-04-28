INSERT INTO email_templates (key, subject_template, html_template, text_template, is_enabled)
VALUES
    (
        'event_invitation',
        '{{.inviter_name}} invited you to {{.event_name}}',
        E'<p>Hi {{.display_name}},</p>\n<p><strong>{{.inviter_name}}</strong> has invited you to join the event <strong>{{.event_name}}</strong> on sub12.io.</p>\n<p>{{if .event_starts_at}}<strong>When:</strong> {{.event_starts_at}}<br>{{end}}{{if .event_location}}<strong>Where:</strong> {{.event_location}}{{end}}</p>\n<p style="margin: 24px 0;"><a href="{{.accept_link}}" style="display:inline-block;padding:12px 20px;background:#b08b3a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:13px;">Join now</a></p>\n<p style="font-size:12px;color:#666;">Or copy and paste this link into your browser: {{.accept_link}}</p>',
        E'Hi {{.display_name}},\n\n{{.inviter_name}} has invited you to join {{.event_name}} on sub12.io.\n{{if .event_starts_at}}When: {{.event_starts_at}}\n{{end}}{{if .event_location}}Where: {{.event_location}}\n{{end}}\nJoin now: {{.accept_link}}',
        TRUE
    )
ON CONFLICT (key) DO NOTHING;
