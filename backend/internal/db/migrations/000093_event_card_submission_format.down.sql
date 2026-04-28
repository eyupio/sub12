DROP INDEX IF EXISTS uniq_score_cards_event_participant_final;
DROP INDEX IF EXISTS idx_score_cards_event_participant;

ALTER TABLE score_cards DROP COLUMN IF EXISTS event_participant_id;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_format_check;
ALTER TABLE events DROP COLUMN IF EXISTS lock_edits_after_verification;
ALTER TABLE events DROP COLUMN IF EXISTS require_image_upload;
ALTER TABLE events DROP COLUMN IF EXISTS required_confirmations;
ALTER TABLE events DROP COLUMN IF EXISTS require_score_verification;
ALTER TABLE events DROP COLUMN IF EXISTS format;
