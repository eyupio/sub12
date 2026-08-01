-- Rows recorded while 'verify' was permitted would violate the narrower
-- constraint, so they are removed before restoring it.
DELETE FROM score_card_actions WHERE action = 'verify';

ALTER TABLE score_card_actions DROP CONSTRAINT IF EXISTS score_card_actions_action_check;

ALTER TABLE score_card_actions
    ADD CONSTRAINT score_card_actions_action_check
    CHECK (action IN ('amend', 'reject', 'reopen'));
