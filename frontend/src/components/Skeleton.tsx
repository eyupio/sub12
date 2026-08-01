import { ReactNode } from 'react'

// Shimmering placeholders shaped like the content they stand in for. Using
// these instead of a bare "Loading…" line keeps the page height stable, so
// content doesn't jump when the query resolves.

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
}: {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}) {
  const radius =
    rounded === 'full' ? '9999px'
    : rounded === 'lg' ? 'var(--radius-lg)'
    : rounded === 'sm' ? '3px'
    : 'var(--radius)'
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  )
}

/** Paragraph placeholder. The last line is short so it reads as prose. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={10} width={i === lines - 1 ? '60%' : '100%'} rounded="sm" />
      ))}
    </div>
  )
}

/** Stand-in for one card in a list: thumbnail, two text lines, trailing value. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`surface-card p-4 flex items-center gap-4 ${className}`} aria-hidden="true">
      <Skeleton width={48} height={48} rounded="lg" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton height={13} width="45%" rounded="sm" />
        <Skeleton height={10} width="70%" rounded="sm" />
      </div>
      <Skeleton width={56} height={22} rounded="full" />
    </div>
  )
}

export function SkeletonList({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

/** Header + rows, sized for the league/standings tables. */
export function SkeletonTable({
  rows = 6,
  columns = 4,
  className = '',
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={`surface-card overflow-hidden ${className}`} role="status" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-line bg-surface-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height={9} width={i === 0 ? '30%' : '15%'} rounded="sm" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3 border-b border-line last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} height={11} width={c === 0 ? '30%' : '15%'} rounded="sm" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Row of stat tiles matching the dashboard's StatsStrip footprint. */
export function SkeletonStats({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card p-4 space-y-3">
          <Skeleton height={9} width="55%" rounded="sm" />
          <Skeleton height={24} width="40%" rounded="sm" />
        </div>
      ))}
    </div>
  )
}

/**
 * Whole-page placeholder for routes that can't render anything meaningful
 * until their primary query resolves: a title block plus a body slot.
 */
export function SkeletonPage({
  children,
  withStats = false,
  className = '',
}: {
  children?: ReactNode
  withStats?: boolean
  className?: string
}) {
  return (
    <div className={`p-4 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in ${className}`} role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton height={22} width={220} rounded="sm" />
        <Skeleton height={11} width={320} rounded="sm" />
      </div>
      {withStats && <SkeletonStats />}
      {children ?? <SkeletonList />}
    </div>
  )
}

/** Inline spinner for buttons and small in-place loads. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`spinner ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  )
}
