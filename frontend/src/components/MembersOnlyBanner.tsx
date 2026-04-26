import { Lock } from 'lucide-react'

interface MembersOnlyBannerProps {
  kind: 'club' | 'league'
  name?: string
  description?: string
  memberCount?: number
  joinPolicy?: string
  onJoinClick?: () => void
  joinLabel?: string
}

export function MembersOnlyBanner({ kind, name, description, memberCount, joinPolicy, onJoinClick, joinLabel }: MembersOnlyBannerProps) {
  const cta = joinLabel ?? (joinPolicy === 'approval' ? 'Request to join' : joinPolicy === 'invite_code' ? 'Enter invite code' : 'Join')
  return (
    <section className="p-6 rounded border border-subtle bg-surface text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-[var(--brass)]/10 text-[var(--brass)] flex items-center justify-center mx-auto">
        <Lock size={18} />
      </div>
      <h2 className="t-subsection-title">{name ?? `This ${kind} is private`}</h2>
      {description && <p className="text-sm text-muted max-w-md mx-auto whitespace-pre-wrap">{description}</p>}
      {typeof memberCount === 'number' && (
        <p className="text-[11px] tracking-widest uppercase text-muted">{memberCount} {memberCount === 1 ? 'member' : 'members'}</p>
      )}
      <p className="text-xs text-muted">Members-only standings, scores and posts are hidden until you join.</p>
      {onJoinClick && (
        <button
          onClick={onJoinClick}
          className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium hover:opacity-90 transition-opacity"
        >
          {cta}
        </button>
      )}
    </section>
  )
}
