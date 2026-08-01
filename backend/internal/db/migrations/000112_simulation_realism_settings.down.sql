ALTER TABLE simulation_settings
    DROP CONSTRAINT IF EXISTS simulation_settings_backdate_days_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_weekend_bias_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_away_day_chance_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_reply_chance_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_session_actions_chk,
    DROP CONSTRAINT IF EXISTS simulation_settings_persona_history_days_chk;

ALTER TABLE simulation_settings
    DROP COLUMN IF EXISTS backdate_days,
    DROP COLUMN IF EXISTS weekend_bias,
    DROP COLUMN IF EXISTS away_day_chance,
    DROP COLUMN IF EXISTS reply_chance,
    DROP COLUMN IF EXISTS session_actions,
    DROP COLUMN IF EXISTS persona_history_days;
