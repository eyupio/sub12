/**
 * Moderators are members a league or club owner promoted to help run it. They
 * are deliberately not called admins — "admin" is the platform-wide role, and a
 * moderator's reach stops at the one league or club they were promoted in.
 *
 * What a moderator may do is delegated by the owner, one capability at a time.
 * The catalogue itself is served by the backend (it is the authority on which
 * keys exist); these constants exist so call sites can name a capability
 * without a magic string.
 */
export const PERM = {
  manageMembers: 'manage_members',
  manageModerators: 'manage_moderators',
  manageSettings: 'manage_settings',
  manageSeasons: 'manage_seasons',
  verifyScores: 'verify_scores',
  moderateContent: 'moderate_content',
  manageSupport: 'manage_support',
  manageLeagues: 'manage_leagues',
  manageEvents: 'manage_events',
} as const

export type ModeratorPermission = (typeof PERM)[keyof typeof PERM]

/** One delegable capability, as described by the backend catalogue. */
export interface ModeratorPermissionInfo {
  key: string
  label: string
  description: string
  /** Granted automatically on promotion. */
  default: boolean
}

/** A viewer's standing in one league or club. */
export interface MemberRole {
  is_member: boolean
  is_moderator: boolean
  is_owner: boolean
  permissions: string[]
}

export interface ModeratorPermissionsResponse {
  catalogue: ModeratorPermissionInfo[]
  role: MemberRole
}

/** Whether a role carries a capability. Owners always do. */
export function can(
  role: { is_moderator?: boolean; is_owner?: boolean; permissions?: string[] } | null | undefined,
  permission: string,
): boolean {
  if (!role) return false
  if (role.is_owner) return true
  if (!role.is_moderator) return false
  return (role.permissions ?? []).includes(permission)
}

/** The label shown against a member: owner, moderator, or nothing. */
export function roleLabel(member: { is_owner?: boolean; is_moderator?: boolean }): string | null {
  if (member.is_owner) return 'Owner'
  if (member.is_moderator) return 'Moderator'
  return null
}

/**
 * Summarises a grant for a members list — the whole catalogue reads as "full
 * access", nothing reads as "no permissions yet".
 */
export function summarisePermissions(
  permissions: string[] | undefined,
  catalogue: ModeratorPermissionInfo[],
): string {
  const granted = permissions ?? []
  if (granted.length === 0) return 'No permissions'
  if (catalogue.length > 0 && granted.length >= catalogue.length) return 'Full access'
  const labels = catalogue.filter((p) => granted.includes(p.key)).map((p) => p.label)
  // A grant can outlive a catalogue entry being renamed; fall back to the key.
  const unknown = granted.filter((k) => !catalogue.some((p) => p.key === k))
  return [...labels, ...unknown].join(', ')
}
