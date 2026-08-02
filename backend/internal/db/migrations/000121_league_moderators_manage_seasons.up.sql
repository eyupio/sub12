-- Opening the next round is the week-to-week work of running a league, so
-- `manage_seasons` is now part of the grant a moderator gets on promotion.
--
-- Moderators promoted before this change hold whatever the old default set
-- was, which did not include it: they could reach the league's settings page
-- and see Seasons & Rounds, but every save came back 403. Backfill them so the
-- new default reaches the people already doing the job — anyone whose owner
-- already ticked the capability is left alone.

UPDATE league_members
SET moderator_permissions = moderator_permissions || ARRAY['manage_seasons']
WHERE is_admin = TRUE
  AND NOT ('manage_seasons' = ANY (moderator_permissions));
