-- Benchrest live events: event-level card-submission format and per-participant
-- score-card link. Existing HFT/FT events default to format='shot_grid' so the
-- per-shot tap flow is untouched. Verification toggles mirror league_config so
-- card_submission events reuse the team's mental model.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'shot_grid';

DO $$ BEGIN
    ALTER TABLE events ADD CONSTRAINT events_format_check
        CHECK (format IN ('shot_grid', 'card_submission'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS require_score_verification    BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS required_confirmations        SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS require_image_upload          BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lock_edits_after_verification BOOLEAN  NOT NULL DEFAULT TRUE;

-- Per-participant link from score_cards. Mirrors the league_round_id pattern:
-- a card belongs to either zero or one event participant.
ALTER TABLE score_cards
    ADD COLUMN IF NOT EXISTS event_participant_id UUID
        REFERENCES event_participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_score_cards_event_participant
    ON score_cards (event_participant_id) WHERE event_participant_id IS NOT NULL;

-- One finalised card per event participant. Drafts are excluded so a participant
-- can restart capture without first deleting their in-progress draft.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_score_cards_event_participant_final
    ON score_cards (event_participant_id)
    WHERE event_participant_id IS NOT NULL AND is_draft = FALSE;
