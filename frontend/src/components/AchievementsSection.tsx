import { Lock, Share2 } from 'lucide-react'
import { Achievement, AchievementDef } from '../api/achievements'
import { iconForAchievement } from '../utils/achievementIcons'
import { formatDate, useRegionalPrefs } from '../utils/date'

interface Props {
  earned: Achievement[]
  allDefs: AchievementDef[]
  // When set, renders a small share icon on each earned achievement and
  // invokes the callback with the achievement key. Owners of the profile
  // (or public visitors) can then share a specific milestone.
  onShareEarned?: (def: AchievementDef) => void
}

export function AchievementsSection({ earned, allDefs, onShareEarned }: Props) {
  const prefs = useRegionalPrefs()
  // Nothing to show when the catalog hasn't loaded yet and the user has no earned items.
  if (allDefs.length === 0 && earned.length === 0) return null

  const earnedByID = new Map(earned.map((a) => [a.id, a]))

  // When the catalog is available, render every def in its stable order with
  // locked/unlocked styling. Fall back to the earned list alone so the section
  // still renders if the public defs endpoint fails.
  const tiles: Array<{ def: AchievementDef; earned?: Achievement }> =
    allDefs.length > 0
      ? allDefs.map((def) => ({ def, earned: earnedByID.get(def.id) }))
      : earned.map((a) => ({ def: a, earned: a }))

  const totalCount = allDefs.length > 0 ? allDefs.length : earned.length
  const earnedCount = earned.length

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Achievements</h2>
        <span className="text-[10px] tracking-widest uppercase text-muted">
          {earnedCount} of {totalCount} earned
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {tiles.map(({ def, earned: userAward }) => {
          const Icon = iconForAchievement(def.icon)
          const isEarned = !!userAward
          const baseClass =
            'flex flex-col items-center justify-center gap-1 p-2 rounded border text-center transition-colors min-h-[78px]'
          const styleClass = isEarned
            ? 'border-[var(--brass)]/40 bg-[var(--brass-pill-bg)] text-[var(--brass)]'
            : 'border-subtle bg-surface text-muted opacity-60'

          return (
            <div
              key={def.id}
              title={def.description}
              className={`${baseClass} ${styleClass} relative`}
            >
              {isEarned && onShareEarned && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShareEarned(def) }}
                  className="absolute top-1 right-1 text-muted hover:text-[var(--brass)] transition-colors"
                  aria-label={`Share ${def.name}`}
                  title={`Share ${def.name}`}
                >
                  <Share2 size={11} />
                </button>
              )}
              <div className="relative">
                <Icon size={20} />
                {!isEarned && (
                  <Lock
                    size={10}
                    className="absolute -bottom-0.5 -right-0.5 text-muted"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="text-[10px] tracking-widest uppercase font-medium leading-tight">
                {def.name}
              </p>
              {isEarned ? (
                <p className="text-[9px] text-muted uppercase tracking-widest">
                  {formatDate(userAward.earned_at, prefs)}
                </p>
              ) : (
                <p className="text-[9px] text-muted leading-tight line-clamp-2">
                  {def.description}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
