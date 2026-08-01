import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Flame } from 'lucide-react'
import type { FeatureRequestPriority, FeatureRequestStatus } from '../api/featureRequests'
import { PRIORITY_LABELS, STATUS_LABELS, stageForStatus } from '../utils/featureBoard'

interface PillProps {
  className?: string
}

/** Stage pill — tinted from the stage colour so light and dark both hold up. */
export function StatusPill({ status, className = '' }: { status: FeatureRequestStatus } & PillProps) {
  const stage = stageForStatus(status)
  const Icon = stage.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{
        color: stage.color,
        borderColor: `color-mix(in srgb, ${stage.color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${stage.color} 12%, transparent)`,
      }}
    >
      <Icon size={12} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}

/**
 * Priority only earns space when it is above the norm — a wall of "Normal"
 * badges tells the reader nothing.
 */
export function PriorityPill({ priority, className = '' }: { priority: FeatureRequestPriority } & PillProps) {
  if (priority !== 'high' && priority !== 'urgent') return null
  const color = priority === 'urgent' ? 'var(--red)' : 'var(--gold)'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      title={`${PRIORITY_LABELS[priority]} priority`}
    >
      <Flame size={11} aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

/** Neutral chip for scope, counts and other quiet metadata. */
export function MetaChip({ icon: Icon, children, className = '' }: { icon?: LucideIcon; children: ReactNode } & PillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-subtle px-2.5 py-1 text-[11px] text-muted ${className}`}>
      {Icon && <Icon size={11} aria-hidden="true" />}
      {children}
    </span>
  )
}
