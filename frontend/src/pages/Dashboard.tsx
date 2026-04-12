import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Users, ChevronRight, Package } from 'lucide-react'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'
import { gearApi, Rifle } from '../api/gear'
import { leagueApi, MyLeagueSummary } from '../api/leagues'
import { pelletTestApi } from '../api/pelletTesting'
import { RifleStats } from '../api/stats'
import { useAuthStore } from '../store/auth'

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

function ordinal(n: number): string {
  if (n <= 0) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function leagueTimingBadge(startsOn?: string, endsOn?: string): { label: string; urgent: boolean } | null {
  const today = new Date().toISOString().slice(0, 10)
  if (startsOn && startsOn > today) {
    return { label: `Starts ${startsOn}`, urgent: false }
  }
  if (endsOn) {
    if (endsOn < today) return { label: 'Ended', urgent: false }
    const daysLeft = Math.ceil((new Date(endsOn).getTime() - Date.now()) / 86400000)
    if (daysLeft <= 7) return { label: `Ends in ${daysLeft}d`, urgent: true }
    return { label: `Ends ${endsOn}`, urgent: false }
  }
  return null
}

export default function Dashboard() {
  const user = useAuthStore(s => s.user)

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getMe(),
  })

  const { data: history } = useQuery({
    queryKey: ['score-cards'],
    queryFn: () => scoreCardApi.list(5, 0),
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })

  const { data: rifleStatsData } = useQuery({
    queryKey: ['rifle-stats'],
    queryFn: () => statsApi.getRifleStats(),
  })

  const { data: myLeaguesData } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
  })

  const { data: pelletTestStats } = useQuery({
    queryKey: ['pellet-test-stats'],
    queryFn: () => pelletTestApi.stats(),
  })

  const recentCards = history?.items ?? []
  const rifles = riflesData?.items?.filter((r: Rifle) => r.is_active) ?? []
  const rifleStats = rifleStatsData?.items ?? []
  const myLeagues = myLeaguesData?.items ?? []

  // Build a map of rifle_id → rifle for enriching rifle stats
  const rifleMap = new Map<string, Rifle>()
  for (const r of riflesData?.items ?? []) {
    rifleMap.set(r.id, r)
  }

  // Build enriched rifle stats with rifle info
  const enrichedRifleStats = rifleStats
    .map((rs: RifleStats) => {
      const rifle = rifleMap.get(rs.rifle_id)
      return rifle ? { ...rs, make: rifle.make, model: rifle.model, image_url: rifle.image_url } : null
    })
    .filter(Boolean) as (RifleStats & { make: string; model: string; image_url?: string })[]

  const initials = user?.display_name
    ?.split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? ''

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">

      {/* Profile header */}
      <Link
        to="/profile"
        className="flex items-center gap-4 bg-surface border border-subtle rounded-lg p-4 lg:p-5 hover:border-[var(--brass)]/30 transition-colors"
      >
        <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full overflow-hidden border border-subtle shrink-0 bg-surface-hover">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted text-lg font-medium">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-medium text-primary truncate">{user?.display_name}</p>
          <div className="flex flex-wrap gap-x-3 text-[11px] text-muted tracking-wide mt-0.5">
            {user?.location && <span>{user.location}</span>}
            {user?.club && <span>{user.club}</span>}
          </div>
        </div>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </Link>

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

      {/* My Rifles + Best Per Rifle */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
        {/* My Rifles */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">My Rifles</h2>
            <Link
              to="/gear"
              className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              Manage →
            </Link>
          </div>
          {rifles.length === 0 ? (
            <Link
              to="/gear"
              className="block text-center p-6 border border-dashed border-subtle rounded-lg text-sm text-muted hover:border-[var(--brass)]/30 transition-colors"
            >
              <Package size={24} className="mx-auto mb-2 opacity-40" />
              Add your first rifle
            </Link>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {rifles.slice(0, 6).map((rifle: Rifle) => (
                <Link
                  key={rifle.id}
                  to="/gear"
                  className="shrink-0 w-28 lg:w-32 bg-surface border border-subtle rounded-lg p-3 hover:border-[var(--brass)]/30 transition-colors text-center"
                >
                  <div className="w-16 h-16 mx-auto rounded-lg overflow-hidden border border-subtle mb-2 bg-surface-hover">
                    {rifle.image_url ? (
                      <img src={rifle.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted">
                        <Package size={20} className="opacity-40" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-secondary font-medium truncate">{rifle.make}</p>
                  <p className="text-[10px] text-muted truncate">{rifle.model}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Best Per Rifle */}
        <div>
          <h2 className="text-[11px] tracking-widest uppercase text-muted mb-3">Best Per Rifle</h2>
          {enrichedRifleStats.length === 0 ? (
            <p className="text-sm text-muted tracking-wide py-4">Log cards with a rifle selected to see per-rifle stats.</p>
          ) : (
            <div className="space-y-2">
              {enrichedRifleStats.map(rs => (
                <Link
                  key={rs.rifle_id}
                  to="/gear"
                  className="flex items-center gap-3 p-3 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded overflow-hidden border border-subtle shrink-0 bg-surface-hover">
                    {rs.image_url ? (
                      <img src={rs.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={12} className="text-muted opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-secondary font-medium truncate">{rs.make} {rs.model}</p>
                    <p className="text-[11px] text-muted">{rs.card_count} card{rs.card_count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <span className="text-lg font-semibold text-[var(--brass)]">{rs.best_score}</span>
                    {rs.best_x_count > 0 && (
                      <span className="text-xs text-[var(--brass)] ml-1">{rs.best_x_count}X</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pellet Testing */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Pellet Testing</h2>
          <Link
            to="/pellet-testing"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            View All →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Tests Logged"
            value={pelletTestStats ? String(pelletTestStats.total_tests) : '—'}
          />
          <StatCard
            label="Best Group"
            value={pelletTestStats?.best_group_mm != null ? `${pelletTestStats.best_group_mm.toFixed(2)}mm` : '—'}
            gold
          />
          <StatCard
            label="Top Pellet"
            value={pelletTestStats?.most_tested_pellet ?? '—'}
          />
        </div>
      </div>

      {/* My Leagues */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">My Leagues</h2>
          <Link
            to="/leagues"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            Browse →
          </Link>
        </div>
        {myLeagues.length === 0 ? (
          <Link
            to="/leagues"
            className="block text-center p-6 border border-dashed border-subtle rounded-lg text-sm text-muted hover:border-[var(--brass)]/30 transition-colors"
          >
            Join a league to see your standings here
          </Link>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {myLeagues.map((league: MyLeagueSummary) => {
              const timing = leagueTimingBadge(league.starts_on, league.ends_on)
              return (
                <Link
                  key={league.id}
                  to="/leagues/$id"
                  params={{ id: league.id }}
                  className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
                >
                  {league.image_url ? (
                    <img src={league.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-subtle shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg border border-subtle shrink-0 bg-surface-hover flex items-center justify-center">
                      <Users size={16} className="text-muted opacity-40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-secondary font-medium truncate">{league.name}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <Users size={11} />
                      <span>{league.member_count}</span>
                      {timing && (
                        <span className={timing.urgent ? 'text-[var(--brass)]' : ''}>· {timing.label}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    {league.user_rank > 0 ? (
                      <>
                        <span className="text-sm text-primary">{ordinal(league.user_rank)}</span>
                        <span className="text-[11px] text-muted ml-0.5">/{league.member_count}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted">—</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
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
