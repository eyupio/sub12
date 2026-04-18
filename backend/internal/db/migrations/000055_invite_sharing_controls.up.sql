-- Allow league/club admins to control whether rank-and-file members may
-- see and share the invite code / link. Default TRUE preserves current
-- behavior; admins opt-in to restriction.
ALTER TABLE league_configs
    ADD COLUMN IF NOT EXISTS allow_member_invites BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS allow_member_invites BOOLEAN NOT NULL DEFAULT TRUE;
