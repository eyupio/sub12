import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-2xl lg:text-3xl font-mono font-normal mt-1 ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>
        {value}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getMe(),
  })

  const { data: history } = useQuery({
    queryKey: ['score-cards'],
    queryFn: () => scoreCardApi.list(5, 0),
  })

  const recentCards = history?.items ?? []

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="Best Score"
          value={stats?.best_score != null ? String(stats.best_score) : '—'}
          gold
        />
        <StatCard
          label="Best X Count"
          value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'}
          gold
        />
        <StatCard
          label="Cards Logged"
          value={stats ? String(stats.cards_logged) : '—'}
        />
        <StatCard
          label="Avg Score"
          value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
        />
      </div>

      {/* Recent cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Recent Cards</h2>
          <Link
            to="/scores/new"
            className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            <Plus size={12} />
            New
          </Link>
        </div>

        {recentCards.length === 0 ? (
          <p className="text-sm text-muted tracking-wide">Log your first card to start tracking.</p>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recentCards.map(card => (
              <Link
                key={card.id}
                to="/scores/$id"
                params={{ id: card.id }}
                className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
              >
                <div>
                  <p className="font-mono text-secondary text-sm">{card.shot_at}</p>
                  {card.location && (
                    <p className="text-[11px] text-muted">{card.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-primary">{card.total_score}</span>
                  {card.x_count > 0 && (
                    <span className="text-xs text-[var(--brass)]">{card.x_count}X</span>
                  )}
                </div>
              </Link>
            ))}
            {stats && stats.cards_logged > 5 && (
              <Link
                to="/scores"
                className="block text-center text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors pt-1 lg:col-span-2"
              >
                View all {stats.cards_logged} cards →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
