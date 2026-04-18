import { Star } from 'lucide-react'

interface StarBadgeProps {
  level: number        // 0–5
  size?: number        // icon size in px (default 10)
  className?: string
}

/**
 * Renders 1–5 filled stars (or nothing for level 0) as a compact badge.
 * Used next to profile avatars throughout the app to show community standing.
 *
 * Level bands:
 *   0 → no badge
 *   1 → ⭐
 *   2 → ⭐⭐
 *   3 → ⭐⭐⭐
 *   4 → ⭐⭐⭐⭐
 *   5 → ⭐⭐⭐⭐⭐
 */
export function StarBadge({ level, size = 10, className = '' }: StarBadgeProps) {
  if (!level || level < 1) return null

  const clamped = Math.min(5, Math.max(1, level))

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Star level ${clamped}`}
      title={`Community level ${clamped}`}
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
}
