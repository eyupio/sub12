import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'

function VerificationDot({ status }: { status: string }) {
  if (status === 'verified') {
    return <CheckCircle size={14} className="text-[var(--success-text)] shrink-0" />
  }
  if (status === 'rejected') {
    return <XCircle size={14} className="text-[var(--error-text)] shrink-0" />
  }
  return <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
}

function CardRow({ card, showVerification }: { card: ScoreCardSummary; showVerification?: boolean }) {
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
        {showVerification && <VerificationDot status={card.verification} />}
        <span className="text-xl font-semibold text-primary">{card.total_score}</span>
        {card.x_count > 0 && (
          <span className="text-sm text-[var(--brass)]">{card.x_count}X</span>
        )}
      </div>
    </Link>
  )
}

export default function ScoreHistory() {
  const [tab, setTab] = useState<'personal' | 'league'>('personal')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['score-cards', tab],
    queryFn: () => scoreCardApi.list(20, 0, tab),
  })

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">My Cards</h1>
        <div className="flex items-center gap-4">
          <Link
            to="/scores/trends"
            className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          >
            Trends →
          </Link>
          <Link
            to="/scores/new"
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            <Plus size={14} />
            New
          </Link>
        </div>
      </div>

      {/* Segmented control */}
      <div className="flex border border-subtle rounded overflow-hidden">
        <button
          onClick={() => setTab('personal')}
          className={`flex-1 py-2 text-[11px] tracking-widest uppercase transition-colors border-r border-subtle ${
            tab === 'personal'
              ? 'bg-[var(--brass)]/10 text-[var(--brass)]'
              : 'text-muted hover:text-secondary'
          }`}
        >
          Personal
        </button>
        <button
          onClick={() => setTab('league')}
          className={`flex-1 py-2 text-[11px] tracking-widest uppercase transition-colors ${
            tab === 'league'
              ? 'bg-[var(--brass)]/10 text-[var(--brass)]'
              : 'text-muted hover:text-secondary'
          }`}
        >
          League
        </button>
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
          {tab === 'personal' ? (
            <>
              <p className="text-muted text-sm tracking-widest uppercase">No personal cards logged yet</p>
              <Link
                to="/scores/new"
                className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
              >
                Log your first card \u2192
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted text-sm tracking-widest uppercase">No league cards yet</p>
              <Link
                to="/leagues"
                className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
              >
                Submit scores through your leagues \u2192
              </Link>
            </>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {data.items.map(card => (
            <CardRow key={card.id} card={card} showVerification={tab === 'league'} />
          ))}
        </div>
      )}
    </div>
  )
}
