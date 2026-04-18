INSERT INTO email_templates (key, subject_template, html_template, text_template, is_enabled)
VALUES
    (
        'ticket_created_confirmation',
        '[{{.brand_name}}] We received your support ticket #{{.ticket_id}}',
        '<p>Hi {{.display_name}},</p><p>Thanks for contacting {{.brand_name}}. Your ticket <strong>#{{.ticket_id}}</strong> ({{.ticket_title}}) has been created.</p><p><a href="{{.ticket_link}}">{{.cta_label}}</a></p><p>— {{.product_name}} Support</p>',
        E'Hi {{.display_name}},\n\nThanks for contacting {{.brand_name}}. Your ticket #{{.ticket_id}} ({{.ticket_title}}) has been created.\n\n{{.cta_label}}: {{.ticket_link}}\n\n— {{.product_name}} Support\n',
        TRUE
    ),
    (
        'ticket_new_reply',
        '[{{.brand_name}}] New reply on ticket #{{.ticket_id}}',
        '<p>Hi {{.display_name}},</p><p>{{.actor_name}} posted a new reply on ticket <strong>#{{.ticket_id}}</strong> ({{.ticket_title}}).</p><p><a href="{{.ticket_link}}">{{.cta_label}}</a></p><p>— {{.product_name}} Support</p>',
        E'Hi {{.display_name}},\n\n{{.actor_name}} posted a new reply on ticket #{{.ticket_id}} ({{.ticket_title}}).\n\n{{.cta_label}}: {{.ticket_link}}\n\n— {{.product_name}} Support\n',
        TRUE
    ),
    (
        'ticket_assigned',
        '[{{.brand_name}}] Ticket #{{.ticket_id}} was assigned to you',
        '<p>Hi {{.display_name}},</p><p>{{.actor_name}} assigned ticket <strong>#{{.ticket_id}}</strong> ({{.ticket_title}}) to you.</p><p><a href="{{.ticket_link}}">{{.cta_label}}</a></p><p>— {{.product_name}} Support</p>',
        E'Hi {{.display_name}},\n\n{{.actor_name}} assigned ticket #{{.ticket_id}} ({{.ticket_title}}) to you.\n\n{{.cta_label}}: {{.ticket_link}}\n\n— {{.product_name}} Support\n',
        TRUE
    ),
    (
        'ticket_status_changed',
        '[{{.brand_name}}] Ticket #{{.ticket_id}} status: {{.status_label}}',
        '<p>Hi {{.display_name}},</p><p>{{.actor_name}} changed ticket <strong>#{{.ticket_id}}</strong> ({{.ticket_title}}) from <strong>{{.from_status_label}}</strong> to <strong>{{.status_label}}</strong>.</p><p><a href="{{.ticket_link}}">{{.cta_label}}</a></p><p>— {{.product_name}} Support</p>',
        E'Hi {{.display_name}},\n\n{{.actor_name}} changed ticket #{{.ticket_id}} ({{.ticket_title}}) from {{.from_status_label}} to {{.status_label}}.\n\n{{.cta_label}}: {{.ticket_link}}\n\n— {{.product_name}} Support\n',
        TRUE
    ),
    (
        'feature_request_accepted_for_refinement',
        '[{{.brand_name}}] Feature request #{{.ticket_id}} accepted for refinement',
        '<p>Hi {{.display_name}},</p><p>Great news — {{.actor_name}} moved your feature request <strong>#{{.ticket_id}}</strong> ({{.ticket_title}}) to <strong>{{.status_label}}</strong>.</p><p><a href="{{.ticket_link}}">{{.cta_label}}</a></p><p>— {{.product_name}} Support</p>',
        E'Hi {{.display_name}},\n\nGreat news — {{.actor_name}} moved your feature request #{{.ticket_id}} ({{.ticket_title}}) to {{.status_label}}.\n\n{{.cta_label}}: {{.ticket_link}}\n\n— {{.product_name}} Support\n',
        TRUE
    )
ON CONFLICT (key) DO NOTHING;
