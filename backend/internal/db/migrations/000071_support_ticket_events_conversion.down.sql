ALTER TABLE support_ticket_events
    DROP CONSTRAINT IF EXISTS support_ticket_events_type_check;

DO $$ BEGIN
    ALTER TABLE support_ticket_events
        ADD CONSTRAINT support_ticket_events_type_check
        CHECK (event_type IN (
            'status_changed',
            'priority_changed',
            'assignee_changed',
            'category_changed'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
