CREATE INDEX IF NOT EXISTS idx_event_scores_participant
    ON event_scores (participant_id, lane, shot_number);
