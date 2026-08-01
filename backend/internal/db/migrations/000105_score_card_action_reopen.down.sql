-- Rows recorded while 'reopen' was permitted would violate the narrower
-- constraint, so drop them before restoring it.
DELETE FROM score_card_actions WHERE action = 'reopen';

ALTER TABLE score_card_actions DROP CONSTRAINT IF EXISTS score_card_actions_action_check;

ALTER TABLE score_card_actions
    ADD CONSTRAINT score_card_actions_action_check
    CHECK (action IN ('amend', 'reject'));
