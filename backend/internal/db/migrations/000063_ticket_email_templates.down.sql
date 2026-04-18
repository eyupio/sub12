DELETE FROM email_templates
WHERE key IN (
    'ticket_created_confirmation',
    'ticket_new_reply',
    'ticket_assigned',
    'ticket_status_changed',
    'feature_request_accepted_for_refinement'
);
