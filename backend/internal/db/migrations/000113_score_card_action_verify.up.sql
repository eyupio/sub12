-- Allow a league admin to explicitly verify a pending card. Widens the audit
-- action CHECK so 'verify' rows can be recorded alongside amend/reject/reopen.
ALTER TABLE score_card_actions DROP CONSTRAINT IF EXISTS score_card_actions_action_check;

ALTER TABLE score_card_actions
    ADD CONSTRAINT score_card_actions_action_check
    CHECK (action IN ('amend', 'reject', 'reopen', 'verify'));
