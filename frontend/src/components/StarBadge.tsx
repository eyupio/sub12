import { forwardRef } from 'react'
import { Star } from 'lucide-react'
import { UserHoverCard } from './UserHoverCard'

interface StarBadgeProps {
  level: number        // 0–5
  size?: number        // icon size in px (default 10)
  className?: string
  userId?: string      // when provided, hovering the stars opens the rich user card
  displayName?: string
  avatarUrl?: string
}

interface StarsProps {
  clamped: number
  size: number
  className: string
  title: string
}

const Stars = forwardRef<HTMLSpanElement, StarsProps>(function Stars(
  { clamped, size, className, title },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Star level ${clamped}`}
      title={title}
    >
      {Array.from({ length: clamped }, (_, i) => (
        <Star
          key={i}
          size={size}
          className="fill-[var(--brass)] text-[var(--brass)]"
        />
      ))}
    </span>
  )
})

/**
 * Renders 1–5 filled stars (or nothing for level 0) as a compact badge.
 * Used next to profile avatars throughout the app to show community standing.
 *
 * Pass userId to swap the native title for the rich UserHoverCard tooltip.
 */
export function StarBadge({
  level,
  size = 10,
  className = '',
  userId,
  displayName,
  avatarUrl,
}: StarBadgeProps) {
  if (!level || level < 1) return null

  const clamped = Math.min(5, Math.max(1, level))
  const useHoverCard = !!userId
  const title = useHoverCard ? '' : `Community level ${clamped}`

  const stars = (
    <Stars clamped={clamped} size={size} className={className} title={title} />
  )

  if (useHoverCard && userId) {
    return (
      <UserHoverCard
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        starLevel={clamped}
      >
        {stars}
      </UserHoverCard>
    )
  }

  return stars
}
