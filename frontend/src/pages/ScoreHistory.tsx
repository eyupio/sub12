import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'

function CardRow({ card }: { card: ScoreCardSummary }) {
  return (
    <Link
      to="/scores/$id"
      params={{ id: card.id }}
      className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02] hover:border-[#D4A44A]/30 transition-colors"
    >
      <div className="space-y-0.5">
        <p className="font-mono text-white/80 text-sm">{card.shot_at}</p>
        {card.location && (
          <p className="text-[11px] text-white/30 tracking-wide">{card.location}</p>
        )}
      </div>
      <div className="flex items-center gap-4 font-mono">
        <span className="text-xl font-semibold text-white">{card.total_score}</span>
        {card.x_count > 0 && (
          <span className="text-sm text-[#D4A44A]">{card.x_count}X</span>
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
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">My Cards</h1>
        <Link
          to="/scores/new"
          className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors"
        >
          <Plus size={14} />
          New
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded border border-white/[0.04] bg-white/[0.01] animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to load score cards.</p>
      )}

      {data && data.items.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <p className="text-white/20 text-sm tracking-widest uppercase">No cards logged yet</p>
          <Link
            to="/scores/new"
            className="inline-block text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors"
          >
            Log your first card →
          </Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map(card => (
            <CardRow key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
