-- Dedicated support ticket domain; keeps moderation reports focused on abuse/content review.

CREATE TABLE IF NOT EXISTS support_tickets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    scope_type    TEXT NOT NULL,
    scope_id      UUID,
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open',
    priority      TEXT NOT NULL DEFAULT 'normal',
    assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ,
    CONSTRAINT support_tickets_scope_type_check
        CHECK (scope_type IN ('platform', 'league', 'club')),
    CONSTRAINT support_tickets_category_check
        CHECK (category IN ('question', 'issue', 'feature')),
    CONSTRAINT support_tickets_status_check
        CHECK (status IN ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed')),
    CONSTRAINT support_tickets_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT support_tickets_scope_presence_check
        CHECK (
            (scope_type = 'platform' AND scope_id IS NULL) OR
            (scope_type IN ('league', 'club') AND scope_id IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body           TEXT NOT NULL,
    internal_note  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_ticket_participants (
    ticket_id      UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL,
    last_read_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ticket_id, user_id),
    CONSTRAINT support_ticket_participants_role_check
        CHECK (role IN ('requester', 'admin', 'observer'))
);

-- Optional audit trail for assignment/category/status lifecycle changes.
CREATE TABLE IF NOT EXISTS support_ticket_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type    TEXT NOT NULL,
    from_value    TEXT,
    to_value      TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_ticket_events_type_check
        CHECK (event_type IN ('status_changed', 'priority_changed', 'assignee_changed', 'category_changed'))
);

-- Queue filters.
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue
    ON support_tickets (status, category, scope_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_scope
    ON support_tickets (scope_type, scope_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_updated
    ON support_tickets (assignee_id, status, updated_at DESC);

-- Conversation access + unread calculations.
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
    ON support_ticket_messages (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_participants_user_ticket
    ON support_ticket_participants (user_id, ticket_id, last_read_at);

CREATE INDEX IF NOT EXISTS idx_support_events_ticket_created
    ON support_ticket_events (ticket_id, created_at DESC);
