import { Shield, Crown, ChevronDown } from 'lucide-react'
import type { ModeratorPermissionInfo } from '../utils/moderators'
import { summarisePermissions } from '../utils/moderators'

/**
 * The owner's delegation editor. Shows one toggle per capability in the
 * catalogue the backend served, so a new capability appears here without a
 * frontend change.
 *
 * `grantable` is the granter's own effective set: a moderator with
 * manage_moderators may share their reach but not manufacture more of it, and
 * the server enforces the same rule, so anything outside it is shown disabled
 * rather than hidden — otherwise a co-moderator sees a shorter list than the
 * owner and cannot tell why.
 */
export function ModeratorPermissionEditor({
  catalogue,
  granted,
  grantable,
  disabled,
  onToggle,
}: {
  catalogue: ModeratorPermissionInfo[]
  granted: string[]
  grantable: string[] | null
  disabled?: boolean
  onToggle: (key: string, next: boolean) => void
}) {
  return (
    <div className="space-y-2 pt-2">
      {catalogue.map((permission) => {
        const isGranted = granted.includes(permission.key)
        const canGrant = grantable === null || grantable.includes(permission.key)
        return (
          <label
            key={permission.key}
            className={`flex items-start gap-2.5 rounded px-2 py-1.5 transition-colors ${
              disabled || !canGrant ? 'opacity-50' : 'hover:bg-[var(--brass-dim)] cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              checked={isGranted}
              disabled={disabled || !canGrant}
              onChange={(e) => onToggle(permission.key, e.target.checked)}
              className="mt-0.5 accent-[var(--brass)]"
            />
            <span className="min-w-0">
              <span className="block text-xs text-secondary">{permission.label}</span>
              <span className="block text-[10px] text-muted">
                {permission.description}
                {!canGrant && ' You cannot delegate a capability you do not hold.'}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** The badge shown against a member: owner, moderator, or nothing. */
export function RoleBadge({ member }: { member: { is_owner?: boolean; is_moderator?: boolean } }) {
  if (member.is_owner) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass-dim)] px-1.5 py-0.5 rounded">
        <Crown size={10} /> Owner
      </span>
    )
  }
  if (member.is_moderator) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass-dim)] px-1.5 py-0.5 rounded">
        <Shield size={10} /> Moderator
      </span>
    )
  }
  return null
}

/**
 * The collapsed one-line summary of a moderator's grant, doubling as the
 * disclosure control for the editor.
 */
export function PermissionSummary({
  permissions,
  catalogue,
  open,
  onToggle,
}: {
  permissions: string[] | undefined
  catalogue: ModeratorPermissionInfo[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-1 text-[10px] text-muted hover:text-[var(--brass)] transition-colors"
    >
      <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      {summarisePermissions(permissions, catalogue)}
    </button>
  )
}
