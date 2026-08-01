-- Allow a league admin to reopen a rejected card for review.
--
-- Rejection was previously terminal: a card wrongly rejected (or rejected
-- before the shooter supplied a photo) could never return to the review
-- queue, and its score stayed out of the standings permanently.
ALTER TABLE score_card_actions DROP CONSTRAINT IF EXISTS score_card_actions_action_check;

ALTER TABLE score_card_actions
    ADD CONSTRAINT score_card_actions_action_check
    CHECK (action IN ('amend', 'reject', 'reopen'));
