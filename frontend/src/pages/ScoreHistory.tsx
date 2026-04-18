import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { leagueApi } from '../api/leagues'
import { statsApi } from '../api/stats'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

function VerificationDot({ status }: { status: string }) {
  if (status === 'verified') {
    return <span title="Verified by league admin"><CheckCircle size={14} className="text-[var(--success-text)] shrink-0" /></span>
  }
  if (status === 'rejected') {
    return <span title="Rejected by league admin"><XCircle size={14} className="text-[var(--error-text)] shrink-0" /></span>
  }
  return <span title="Pending review by league admin"><AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" /></span>
}

function CardRow({ card, showVerification }: { card: ScoreCardSummary; showVerification?: boolean }) {
  const prefs = useRegionalPrefs()
  return (
    <Link
      to="/scores/$id"
      params={{ id: card.id }}
      className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      <div className="space-y-0.5">
        <p className="font-mono text-secondary text-sm">{formatDate(card.shot_at, prefs)}</p>
        {card.league_name && (
          <p className="text-[11px] text-[var(--brass)] tracking-wide">{card.league_name}</p>
        )}
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
  const [leagueFilter, setLeagueFilter] = useState('')

  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: tab === 'league',
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['score-cards', tab, leagueFilter],
    queryFn: () => scoreCardApi.list(20, 0, tab, leagueFilter || undefined),
  })

  const { data: trendsData } = useQuery({
    queryKey: ['score-trends', 'week', null],
    queryFn: () => statsApi.getScoreTrends('week'),
  })

  const trendPoints = trendsData?.items ?? []
  const firstAvg = trendPoints[0]?.avg_score
  const lastAvg = trendPoints[trendPoints.length - 1]?.avg_score
  const trendDelta = firstAvg != null && lastAvg != null && trendPoints.length >= 2
    ? lastAvg - firstAvg
    : null
  const latestBest = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].best_score : null
  const latestAvgX = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].avg_x_count : null
  const totalCards = trendPoints.reduce((s, p) => s + (p.card_count ?? 0), 0)
  const trendColorClass = trendDelta != null && trendDelta > 0
    ? 'text-[var(--success-text)]'
    : trendDelta != null && trendDelta < 0
    ? 'text-[var(--error-text)]'
    : 'text-muted'

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">My Cards</h1>
          <HelpIcon content={pageHelp.scores} />
        </div>
        <Link
          to="/scores/new"
          className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          <Plus size={14} />
          New
        </Link>
      </div>

      {/* Trends summary */}
      {trendPoints.length > 0 && (
        <div className="bg-surface border border-subtle rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">Weekly Trends</h2>
            <Link
              to="/scores/trends"
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              View Details
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] tracking-widest uppercase text-muted">Trend</p>
              {trendDelta != null ? (
                <div className="flex items-center gap-1">
                  {trendDelta > 0
                    ? <TrendingUp size={14} className="text-[var(--success-text)]" />
                    : trendDelta < 0
                    ? <TrendingDown size={14} className="text-[var(--error-text)]" />
                    : <Minus size={14} className="text-muted" />
                  }
                  <span className={`font-mono text-sm ${trendColorClass}`}>
                    {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)}
                  </span>
                </div>
              ) : <span className="text-muted font-mono text-sm">{'\u2014'}</span>}
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] tracking-widest uppercase text-muted">Best</p>
              <p className="font-mono text-sm text-secondary">{latestBest ?? '\u2014'}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] tracking-widest uppercase text-muted">Avg X</p>
              <p className="font-mono text-sm text-[var(--brass)]">{latestAvgX != null ? latestAvgX.toFixed(1) : '\u2014'}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted">{totalCards} card{totalCards !== 1 ? 's' : ''} logged across {trendPoints.length} week{trendPoints.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Segmented control */}
      <div className="flex border border-subtle rounded overflow-hidden">
        <button
          onClick={() => { setTab('personal'); setLeagueFilter('') }}
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

      {tab === 'league' && myLeagues && myLeagues.items.length > 0 && (
        <select
          value={leagueFilter}
          onChange={e => setLeagueFilter(e.target.value)}
          className="bg-surface border border-subtle rounded px-2.5 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 transition-colors w-full"
        >
          <option value="">All Leagues</option>
          {myLeagues.items.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}

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
                Log your first card {'\u2192'}
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted text-sm tracking-widest uppercase">No league cards yet</p>
              <Link
                to="/leagues"
                className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
              >
                Submit scores through your leagues {'\u2192'}
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
