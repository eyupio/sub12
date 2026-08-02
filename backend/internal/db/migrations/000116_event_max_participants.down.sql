ALTER TABLE events DROP CONSTRAINT IF EXISTS events_max_participants_check;

ALTER TABLE events DROP COLUMN IF EXISTS max_participants;
