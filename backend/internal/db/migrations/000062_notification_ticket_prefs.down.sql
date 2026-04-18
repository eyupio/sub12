ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS feature_request_state_changed_email,
    DROP COLUMN IF EXISTS ticket_status_changed_email,
    DROP COLUMN IF EXISTS ticket_assigned_email,
    DROP COLUMN IF EXISTS ticket_replied_email,
    DROP COLUMN IF EXISTS ticket_created_email,
    DROP COLUMN IF EXISTS feature_request_state_changed,
    DROP COLUMN IF EXISTS ticket_status_changed,
    DROP COLUMN IF EXISTS ticket_assigned,
    DROP COLUMN IF EXISTS ticket_replied,
    DROP COLUMN IF EXISTS ticket_created;
