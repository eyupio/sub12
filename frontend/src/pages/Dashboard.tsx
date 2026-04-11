import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
      <p className="text-[10px] tracking-widest uppercase text-white/30">{label}</p>
      <p className={`text-2xl font-mono font-normal mt-1 ${gold ? 'text-[#D4A44A]' : 'text-white/80'}`}>
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
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
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
          <h2 className="text-[11px] tracking-widest uppercase text-white/40">Recent Cards</h2>
          <Link
            to="/scores/new"
            className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors"
          >
            <Plus size={12} />
            New
          </Link>
        </div>

        {recentCards.length === 0 ? (
          <p className="text-sm text-white/25 tracking-wide">Log your first card to start tracking.</p>
        ) : (
          <div className="space-y-2">
            {recentCards.map(card => (
              <Link
                key={card.id}
                to="/scores/$id"
                params={{ id: card.id }}
                className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02] hover:border-[#D4A44A]/30 transition-colors"
              >
                <div>
                  <p className="font-mono text-white/70 text-sm">{card.shot_at}</p>
                  {card.location && (
                    <p className="text-[11px] text-white/25">{card.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-white">{card.total_score}</span>
                  {card.x_count > 0 && (
                    <span className="text-xs text-[#D4A44A]">{card.x_count}X</span>
                  )}
                </div>
              </Link>
            ))}
            {stats && stats.cards_logged > 5 && (
              <Link
                to="/scores"
                className="block text-center text-[11px] tracking-widest uppercase text-white/25 hover:text-white/50 transition-colors pt-1"
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
