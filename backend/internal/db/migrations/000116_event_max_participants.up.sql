-- Optional participant capacity for live events. NULL means unlimited.
-- Enforced at join/guest-add time (the insert re-checks under a row lock on
-- the event so concurrent joins cannot overshoot).

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS max_participants INT NULL;

DO $$ BEGIN
    ALTER TABLE events ADD CONSTRAINT events_max_participants_check
        CHECK (max_participants IS NULL OR max_participants >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
