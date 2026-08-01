import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Hammer, ListChecks, Search, XCircle } from 'lucide-react'
import type { FeatureRequestPriority, FeatureRequestStatus } from '../api/featureRequests'

/**
 * The board speaks in five plain-English stages rather than the eight raw
 * statuses the admin workflow uses. Everything on the page — filters, roadmap
 * columns, pills, the history timeline — reads from this one table so a status
 * always means the same thing wherever it appears.
 */
export interface FeatureStage {
  key: FeatureStageKey
  label: string
  blurb: string
  statuses: FeatureRequestStatus[]
  icon: LucideIcon
  /** Foreground colour token; pills and rails derive their tint from it. */
  color: string
}

export type FeatureStageKey = 'reviewing' | 'planned' | 'building' | 'shipped' | 'declined'

export const FEATURE_STAGES: FeatureStage[] = [
  {
    key: 'reviewing',
    label: 'Under review',
    blurb: 'Fresh ideas being read and refined. Vote to push them up.',
    statuses: ['submitted', 'refining'],
    icon: Search,
    color: 'var(--text-muted)',
  },
  {
    key: 'planned',
    label: 'Planned',
    blurb: 'Accepted and queued up to be built.',
    statuses: ['accepted', 'planned'],
    icon: ListChecks,
    color: 'var(--gold)',
  },
  {
    key: 'building',
    label: 'In progress',
    blurb: 'Actively being worked on right now.',
    statuses: ['in_progress'],
    icon: Hammer,
    color: 'var(--gold-2)',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    blurb: 'Live in the app. Thanks for the nudge.',
    statuses: ['done', 'implemented'],
    icon: CheckCircle2,
    color: 'var(--green)',
  },
  {
    key: 'declined',
    label: 'Not planned',
    blurb: "Won't be built — the reasoning is in the discussion.",
    statuses: ['rejected'],
    icon: XCircle,
    color: 'var(--red)',
  },
]

/** Columns of the roadmap view. "Not planned" is a filter, not a column. */
export const ROADMAP_STAGES = FEATURE_STAGES.filter(stage => stage.key !== 'declined')

const STAGE_BY_STATUS = new Map<FeatureRequestStatus, FeatureStage>(
  FEATURE_STAGES.flatMap(stage => stage.statuses.map(status => [status, stage] as const)),
)

export function stageForStatus(status: FeatureRequestStatus): FeatureStage {
  return STAGE_BY_STATUS.get(status) ?? FEATURE_STAGES[0]
}

/** Human wording for a raw status, used where the exact step matters. */
export const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  submitted: 'Submitted',
  refining: 'Being refined',
  accepted: 'Accepted',
  rejected: 'Not planned',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Shipped',
  implemented: 'Shipped',
}

export const PRIORITY_LABELS: Record<FeatureRequestPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const PRIORITY_ORDER: Record<FeatureRequestPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
}
