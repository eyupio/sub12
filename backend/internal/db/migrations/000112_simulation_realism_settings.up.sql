-- Admin controls for how human the simulated community behaves: how far back
-- logged sessions are dated, how strongly they cluster at weekends, how often a
-- persona shoots away from home, how often a comment joins an existing thread,
-- how many actions a persona takes per visit, and how far back a newly
-- provisioned roster's join dates are spread. All additive and idempotent.

ALTER TABLE simulation_settings
    ADD COLUMN IF NOT EXISTS backdate_days        INTEGER NOT NULL DEFAULT 45,
    ADD COLUMN IF NOT EXISTS weekend_bias         INTEGER NOT NULL DEFAULT 45,
    ADD COLUMN IF NOT EXISTS away_day_chance      INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS reply_chance         INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS session_actions      INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS persona_history_days INTEGER NOT NULL DEFAULT 240;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_backdate_days_chk CHECK (backdate_days BETWEEN 0 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_weekend_bias_chk CHECK (weekend_bias BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_away_day_chance_chk CHECK (away_day_chance BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_reply_chance_chk CHECK (reply_chance BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_session_actions_chk CHECK (session_actions BETWEEN 1 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE simulation_settings
        ADD CONSTRAINT simulation_settings_persona_history_days_chk CHECK (persona_history_days BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
