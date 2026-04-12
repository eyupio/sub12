import type { ConfidenceBadge as ConfidenceBadgeType } from '../api/pelletTesting'

const BADGE_CONFIG = {
  single: { label: 'Single Test', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  emerging: { label: 'Emerging', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  proven: { label: 'Well Proven', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
} as const

interface Props {
  badge: ConfidenceBadgeType
  size?: 'sm' | 'md'
}

export default function ConfidenceBadge({ badge, size = 'sm' }: Props) {
  const config = BADGE_CONFIG[badge.level]
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium uppercase tracking-wider ${config.color} ${sizeClasses}`}
      title={`${badge.test_count} test${badge.test_count !== 1 ? 's' : ''}${badge.consistency_score != null ? ` · σ ${badge.consistency_score.toFixed(2)}mm` : ''}`}
    >
      {config.label}
      <span className="opacity-60">({badge.test_count})</span>
    </span>
  )
}
