ALTER TABLE league_configs
    ADD COLUMN IF NOT EXISTS lock_edits_after_verification BOOLEAN NOT NULL DEFAULT FALSE;
