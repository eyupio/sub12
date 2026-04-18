DROP INDEX IF EXISTS idx_support_events_ticket_created;
DROP INDEX IF EXISTS idx_support_participants_user_ticket;
DROP INDEX IF EXISTS idx_support_messages_ticket_created;
DROP INDEX IF EXISTS idx_support_tickets_assignee_updated;
DROP INDEX IF EXISTS idx_support_tickets_scope;
DROP INDEX IF EXISTS idx_support_tickets_queue;

DROP TABLE IF EXISTS support_ticket_events;
DROP TABLE IF EXISTS support_ticket_participants;
DROP TABLE IF EXISTS support_ticket_messages;
DROP TABLE IF EXISTS support_tickets;
