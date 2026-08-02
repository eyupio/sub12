-- Put `manage_seasons` back to a capability the owner has to delegate by hand.

UPDATE league_members
SET moderator_permissions = array_remove(moderator_permissions, 'manage_seasons')
WHERE is_admin = TRUE;
