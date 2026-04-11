import { useParams, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { scoreCardApi } from '../api/scoreCards'

export default function ScoreCardDetail() {
  const { id } = useParams({ from: '/app/scores/$id' })

  const { data: card, isLoading, isError } = useQuery({
    queryKey: ['score-cards', id],
    queryFn: () => scoreCardApi.get(id),
  })

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        <div className="h-6 w-32 bg-white/[0.04] rounded animate-pulse" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 25 }).map((_, i) => (
            <div key={i} className="aspect-square bg-white/[0.03] rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !card) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-red-400 text-sm">Card not found.</p>
        <Link to="/scores" className="block mt-4 text-[11px] tracking-widest uppercase text-[#D4A44A]">← Back</Link>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/scores" className="text-white/30 hover:text-white/60 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-medium tracking-widest uppercase text-white/80">{card.shot_at}</h1>
          {card.location && <p className="text-xs text-white/30 tracking-wide">{card.location}</p>}
        </div>
      </div>

      {/* Score grid */}
      <div className="grid grid-cols-5 gap-2">
        {card.shot_scores.map((score, i) => {
          const isX = score === 10 && card.shot_xs[i]
          return (
            <div
              key={i}
              className={[
                'aspect-square rounded border font-mono font-medium flex items-center justify-center',
                isX
                  ? 'bg-[#D4A44A]/15 border-[#D4A44A]/50 text-[#D4A44A]'
                  : score === 10
                  ? 'bg-[#D4A44A]/10 border-[#D4A44A]/40 text-[#D4A44A]'
                  : score > 0
                  ? 'bg-white/[0.06] border-white/[0.15] text-white/80'
                  : 'bg-white/[0.02] border-white/[0.04] text-white/20',
              ].join(' ')}
            >
              <span className={isX ? 'text-xl font-bold' : score === 10 ? 'text-base' : 'text-lg'}>
                {isX ? 'X' : score}
              </span>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="flex gap-8 font-mono border-t border-white/[0.06] pt-4">
        <div>
          <p className="text-[11px] tracking-widest uppercase text-white/30">Total</p>
          <p className="text-3xl font-semibold text-white">{card.total_score}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-widest uppercase text-white/30">X Count</p>
          <p className="text-3xl font-semibold text-[#D4A44A]">{card.x_count}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-widest uppercase text-white/30">Avg</p>
          <p className="text-3xl font-semibold text-white/60">
            {(card.total_score / 25).toFixed(1)}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2 text-sm border-t border-white/[0.06] pt-4">
        {card.wind_mph != null && (
          <div className="flex justify-between">
            <span className="text-white/30 tracking-widest uppercase text-[11px]">Wind</span>
            <span className="font-mono text-white/60">{card.wind_mph} mph</span>
          </div>
        )}
        {card.temp_celsius != null && (
          <div className="flex justify-between">
            <span className="text-white/30 tracking-widest uppercase text-[11px]">Temp</span>
            <span className="font-mono text-white/60">{card.temp_celsius}°C</span>
          </div>
        )}
        {card.notes && (
          <div className="pt-1">
            <p className="text-[11px] tracking-widest uppercase text-white/30 mb-1">Notes</p>
            <p className="text-white/50 text-sm leading-relaxed">{card.notes}</p>
          </div>
        )}
        <div className="flex justify-between pt-1">
          <span className="text-white/20 tracking-widest uppercase text-[11px]">Verification</span>
          <span className={[
            'text-[11px] tracking-widest uppercase font-mono',
            card.verification === 'verified' ? 'text-green-400' : 'text-white/30',
          ].join(' ')}>
            {card.verification}
          </span>
        </div>
      </div>
    </div>
  )
}
