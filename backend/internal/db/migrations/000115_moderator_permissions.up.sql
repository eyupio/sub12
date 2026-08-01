-- Promoted league and club members are moderators, not admins, and what they
-- may do is now delegated by the owner rather than implied by the flag. Each
-- membership row carries the capabilities its owner has granted; the owner
-- (leagues.created_by / clubs.created_by) is never gated by this column.
--
-- Existing moderators are backfilled with the full set so nobody silently
-- loses a capability they had before this migration.

ALTER TABLE league_members
    ADD COLUMN IF NOT EXISTS moderator_permissions TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE club_members
    ADD COLUMN IF NOT EXISTS moderator_permissions TEXT[] NOT NULL DEFAULT '{}';

UPDATE league_members
SET moderator_permissions = ARRAY[
        'manage_members',
        'manage_moderators',
        'manage_settings',
        'manage_seasons',
        'verify_scores',
        'moderate_content',
        'manage_support'
    ]
WHERE is_admin = TRUE
  AND moderator_permissions = '{}';

UPDATE club_members
SET moderator_permissions = ARRAY[
        'manage_members',
        'manage_moderators',
        'manage_settings',
        'manage_leagues',
        'manage_events',
        'moderate_content',
        'manage_support'
    ]
WHERE is_admin = TRUE
  AND moderator_permissions = '{}';
