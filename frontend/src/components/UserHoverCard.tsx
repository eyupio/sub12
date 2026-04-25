import { ReactElement, useState } from 'react'
import Tippy from '@tippyjs/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { achievementApi } from '../api/achievements'
import { iconForAchievement } from '../utils/achievementIcons'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface UserHoverCardProps {
  userId: string
  displayName?: string
  avatarUrl?: string | null
  starLevel?: number
  children: ReactElement
  placement?: Placement
}

const STAR_STEP = 3 // backend: star_level = floor(achievement_count / 3), capped at 5
const MAX_LEVEL = 5
const MAX_VISIBLE = 12

function initialsOf(name?: string) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function UserHoverCard({
  userId,
  displayName,
  avatarUrl,
  starLevel = 0,
  children,
  placement = 'top',
}: UserHoverCardProps) {
  const [shown, setShown] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['user-hover-card', userId],
    queryFn: () => achievementApi.listForUser(userId),
    enabled: shown,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const earned = data?.items ?? []
  const level = Math.max(0, Math.min(MAX_LEVEL, starLevel))
  const nextThreshold = level < MAX_LEVEL ? (level + 1) * STAR_STEP : null

  const content = (
    <div className="w-72 text-left">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-subtle">
        <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName ?? ''} className="w-full h-full object-cover" />
          ) : (
            initialsOf(displayName)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary truncate">{displayName ?? 'Member'}</p>
          {level > 0 && (
            <span className="inline-flex items-center gap-0.5" aria-label={`Star level ${level}`}>
              {Array.from({ length: level }, (_, i) => (
                <Star key={i} size={10} className="fill-[var(--brass)] text-[var(--brass)]" />
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Stars explanation */}
      <p className="text-[11px] text-muted mt-2 leading-snug">
        {level === 0
          ? `No stars yet — earn ${STAR_STEP} achievements to unlock the first star.`
          : level === MAX_LEVEL
          ? `Community Level ${level} — top tier (${level * STAR_STEP}+ achievements).`
          : `Community Level ${level} — ${level * STAR_STEP}+ achievements. ${
              nextThreshold ? `${nextThreshold - earned.length > 0 ? nextThreshold - earned.length : 1} more for Level ${level + 1}.` : ''
            }`}
      </p>

      {/* Achievements grid */}
      <div className="mt-3">
        <p className="text-[10px] tracking-widest uppercase text-muted mb-1.5">
          Achievements{earned.length > 0 ? ` · ${earned.length}` : ''}
        </p>

        {isLoading && (
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-7 rounded bg-surface-hover animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <p className="text-[11px] text-muted italic">Achievements unavailable.</p>
        )}

        {!isLoading && !isError && earned.length === 0 && (
          <p className="text-[11px] text-muted italic">No achievements earned yet.</p>
        )}

        {!isLoading && !isError && earned.length > 0 && (
          <div className="grid grid-cols-6 gap-1.5">
            {earned.slice(0, MAX_VISIBLE).map((a) => {
              const Icon = iconForAchievement(a.icon)
              return (
                <div
                  key={a.id}
                  title={`${a.name}${a.description ? ` — ${a.description}` : ''}`}
                  className="flex items-center justify-center h-7 rounded border border-[var(--brass)]/40 bg-[var(--brass-pill-bg)] text-[var(--brass)]"
                >
                  <Icon size={14} />
                </div>
              )
            })}
            {earned.length > MAX_VISIBLE && (
              <div className="flex items-center justify-center h-7 rounded border border-subtle text-[10px] text-muted">
                +{earned.length - MAX_VISIBLE}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer link */}
      <div className="mt-3 pt-2 border-t border-subtle">
        <Link
          to="/users/$id"
          params={{ id: userId }}
          className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          View profile →
        </Link>
      </div>
    </div>
  )

  return (
    <Tippy
      content={content}
      placement={placement}
      delay={[300, 100]}
      interactive
      arrow
      maxWidth={320}
      onShow={() => setShown(true)}
      appendTo={() => document.body}
    >
      {children}
    </Tippy>
  )
}

export default UserHoverCard
