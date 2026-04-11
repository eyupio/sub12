import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, X as XIcon } from 'lucide-react'
import { scoreCardApi } from '../api/scoreCards'

export default function ScoreCardDetail() {
  const { id } = useParams({ from: '/app/scores/$id' })
  const [showLightbox, setShowLightbox] = useState(false)

  const { data: card, isLoading, isError } = useQuery({
    queryKey: ['score-cards', id],
    queryFn: () => scoreCardApi.get(id),
  })

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-3 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-32 bg-surface rounded animate-pulse" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 25 }).map((_, i) => (
            <div key={i} className="aspect-square bg-surface rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !card) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-[var(--error-text)] text-sm">Card not found.</p>
        <Link to="/scores" className="block mt-4 text-[11px] tracking-widest uppercase text-[var(--brass)]">← Back</Link>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/scores" className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg lg:text-xl font-medium tracking-widest uppercase text-secondary">{card.shot_at}</h1>
          {card.location && <p className="text-xs text-muted tracking-wide">{card.location}</p>}
        </div>
      </div>

      {/* Desktop: two-column layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Left column: score grid + totals */}
        <div className="space-y-6">
          {/* Score grid */}
          <div className="grid grid-cols-5 gap-2 lg:gap-3">
            {card.shot_scores.map((score, i) => {
              const isX = score === 10 && card.shot_xs[i]
              return (
                <div
                  key={i}
                  className={[
                    'aspect-square rounded border font-mono font-medium flex items-center justify-center',
                    isX
                      ? 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]'
                      : score === 10
                      ? 'bg-[var(--brass)]/10 border-[var(--brass)]/40 text-[var(--brass)]'
                      : score > 0
                      ? 'bg-surface-hover border-strong text-secondary'
                      : 'bg-surface border-subtle text-muted',
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
          <div className="flex gap-8 font-mono border-t border-subtle pt-4">
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">Total</p>
              <p className="text-3xl font-semibold text-primary">{card.total_score}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">X Count</p>
              <p className="text-3xl font-semibold text-[var(--brass)]">{card.x_count}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">Avg</p>
              <p className="text-3xl font-semibold text-secondary">
                {(card.total_score / 25).toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* Right column: metadata + photo */}
        <div className="space-y-4 mt-6 lg:mt-0">
          {/* Metadata */}
          <div className="space-y-2 text-sm border-t lg:border-t-0 border-subtle pt-4 lg:pt-0">
            {card.wind_mph != null && (
              <div className="flex justify-between">
                <span className="text-muted tracking-widest uppercase text-[11px]">Wind</span>
                <span className="font-mono text-secondary">{card.wind_mph} mph</span>
              </div>
            )}
            {card.temp_celsius != null && (
              <div className="flex justify-between">
                <span className="text-muted tracking-widest uppercase text-[11px]">Temp</span>
                <span className="font-mono text-secondary">{card.temp_celsius}°C</span>
              </div>
            )}
            {card.notes && (
              <div className="pt-1">
                <p className="text-[11px] tracking-widest uppercase text-muted mb-1">Notes</p>
                <p className="text-secondary text-sm leading-relaxed">{card.notes}</p>
              </div>
            )}
            <div className="flex justify-between pt-1">
              <span className="text-muted tracking-widest uppercase text-[11px]">Verification</span>
              <span className={[
                'text-[11px] tracking-widest uppercase font-mono',
                card.verification === 'verified' ? 'text-[var(--success-text)]' : 'text-muted',
              ].join(' ')}>
                {card.verification}
              </span>
            </div>
          </div>

          {/* Score card photo */}
          {card.card_image_url && (
            <div className="pt-4 border-t border-subtle">
              <p className="text-[11px] tracking-widest uppercase text-muted mb-2">Score Card Photo</p>
              <button onClick={() => setShowLightbox(true)} className="w-full">
                <img
                  src={card.card_image_url}
                  alt="Score card photo"
                  className="rounded border border-subtle max-h-64 w-full object-contain bg-surface cursor-zoom-in"
                  loading="lazy"
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {showLightbox && card.card_image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute top-2 right-2 bg-page/80 backdrop-blur rounded-full p-2 text-muted hover:text-primary transition-colors z-10"
              aria-label="Close"
            >
              <XIcon size={20} />
            </button>
            <img
              src={card.card_image_url}
              alt="Score card photo"
              className="max-h-[85vh] max-w-full object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  )
}
