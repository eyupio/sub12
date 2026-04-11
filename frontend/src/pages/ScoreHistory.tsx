import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'

function CardRow({ card }: { card: ScoreCardSummary }) {
  return (
    <Link
      to="/scores/$id"
      params={{ id: card.id }}
      className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      <div className="space-y-0.5">
        <p className="font-mono text-secondary text-sm">{card.shot_at}</p>
        {card.location && (
          <p className="text-[11px] text-muted tracking-wide">{card.location}</p>
        )}
      </div>
      <div className="flex items-center gap-4 font-mono">
        <span className="text-xl font-semibold text-primary">{card.total_score}</span>
        {card.x_count > 0 && (
          <span className="text-sm text-[var(--brass)]">{card.x_count}X</span>
        )}
      </div>
    </Link>
  )
}

export default function ScoreHistory() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['score-cards'],
    queryFn: () => scoreCardApi.list(),
  })

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">My Cards</h1>
        <Link
          to="/scores/new"
          className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          <Plus size={14} />
          New
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded border border-subtle bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-[var(--error-text)] text-sm">Failed to load score cards.</p>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted text-sm tracking-widest uppercase">No cards logged yet</p>
          <Link
            to="/scores/new"
            className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            Log your first card →
          </Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {data.items.map(card => (
            <CardRow key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
