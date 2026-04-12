import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Users, Package, Target,
  TrendingUp, TrendingDown, Crosshair, Trophy, MapPin,
} from 'lucide-react'
import { statsApi, UserStats, RifleStats } from '../api/stats'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { gearApi, Rifle } from '../api/gear'
import { leagueApi, MyLeagueSummary } from '../api/leagues'
import { pelletTestApi, PelletTestStats } from '../api/pelletTesting'
import { useAuthStore } from '../store/auth'

// ─── helpers ────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  if (n <= 0) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function leagueTimingBadge(startsOn?: string, endsOn?: string): { label: string; urgent: boolean } | null {
  const today = new Date().toISOString().slice(0, 10)
  if (startsOn && startsOn > today) return { label: `Starts ${startsOn}`, urgent: false }
  if (endsOn) {
    if (endsOn < today) return { label: 'Ended', urgent: false }
    const daysLeft = Math.ceil((new Date(endsOn).getTime() - Date.now()) / 86400000)
    if (daysLeft <= 7) return { label: `Ends in ${daysLeft}d`, urgent: true }
    return { label: `Ends ${endsOn}`, urgent: false }
  }
  return null
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  return d.toLocaleDateString('en-GB', opts)
}

function scoreDelta(score: number, avg: number): { label: string; sign: 'pos' | 'neg' | 'flat' } {
  const diff = score - avg
  if (Math.abs(diff) < 0.5) return { label: 'avg', sign: 'flat' }
  return {
    label: `${diff > 0 ? '+' : ''}${diff.toFixed(1)} vs avg`,
    sign: diff > 0 ? 'pos' : 'neg',
  }
}

function leagueIsActive(l: MyLeagueSummary): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (l.starts_on && l.starts_on > today) return false
  if (l.ends_on && l.ends_on < today) return false
  return true
}

// ─── insight engine ─────────────────────────────────────────────────────────

interface Insight {
  id: string
  icon: React.ReactNode
  title: string
  body: string
  cta?: { label: string; to: string; params?: Record<string, string> }
  variant: 'default' | 'highlight'
}

type EnrichedRifleStats = RifleStats & { make: string; model: string; image_url?: string; calibre: string }

function computeInsights(p: {
  stats: UserStats | undefined
  recentCards: ScoreCardSummary[]
  rifles: Rifle[]
  rifleStats: RifleStats[]
  enrichedRifleStats: EnrichedRifleStats[]
  myLeagues: MyLeagueSummary[]
  pelletTestStats: PelletTestStats | undefined
}): Insight[] {
  const insights: Insight[] = []

  // 1. PB proximity
  if (
    p.stats?.cards_logged != null &&
    p.stats.cards_logged >= 5 &&
    p.stats.best_score != null &&
    p.stats.avg_score != null
  ) {
    const gap = p.stats.best_score - p.stats.avg_score
    if (gap <= 3) {
      insights.push({
        id: 'pb-close',
        icon: <Target size={16} />,
        title: `${gap.toFixed(1)} below your best`,
        body: 'Your average is tracking close to your personal best. Consistency is your next lever.',
        cta: { label: 'Log a card', to: '/scores/new' },
        variant: 'highlight',
      })
    }
  }

  // 2. Rifles exist but none linked to scored cards
  if (p.rifles.length > 0 && p.enrichedRifleStats.length === 0) {
    insights.push({
      id: 'no-rifle-stats',
      icon: <Package size={16} />,
      title: 'Link a rifle to your next card',
      body: 'Assigning a rifle unlocks per-platform analysis and shows which setup is performing best.',
      cta: { label: 'Log card', to: '/scores/new' },
      variant: 'default',
    })
  }

  // 3. A rifle exists with no stats entry
  if (insights.length < 3) {
    const untested = p.rifles.find(r => !p.rifleStats.some(rs => rs.rifle_id === r.id))
    if (untested) {
      insights.push({
        id: 'untested-rifle',
        icon: <Package size={16} />,
        title: `${untested.make} ${untested.model} has no data yet`,
        body: 'Log a card with this rifle to start building per-platform performance history.',
        cta: { label: 'Log card', to: '/scores/new' },
        variant: 'default',
      })
    }
  }

  // 4. No ammo testing
  if (insights.length < 3 && p.rifles.length > 0 && (p.pelletTestStats?.total_tests ?? 0) === 0) {
    insights.push({
      id: 'no-ammo-test',
      icon: <Crosshair size={16} />,
      title: 'Ammunition untested',
      body: 'Pellet selection can account for significant group-size variation. Start a test session to find your optimal load.',
      cta: { label: 'Start test', to: '/pellet-testing' },
      variant: 'default',
    })
  }

  // 5. League ending soon
  if (insights.length < 3) {
    const today = new Date().toISOString().slice(0, 10)
    const urgent = p.myLeagues.find(l => {
      if (!l.ends_on || l.ends_on < today) return false
      const daysLeft = Math.ceil((new Date(l.ends_on).getTime() - Date.now()) / 86400000)
      return daysLeft <= 7 && leagueIsActive(l)
    })
    if (urgent) {
      const daysLeft = Math.ceil((new Date(urgent.ends_on!).getTime() - Date.now()) / 86400000)
      insights.push({
        id: 'league-ending',
        icon: <Trophy size={16} />,
        title: `${urgent.name} closes soon`,
        body: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. Submit your best card before the window closes.`,
        cta: { label: 'View league', to: '/leagues/$id', params: { id: urgent.id } },
        variant: 'highlight',
      })
    }
  }

  // 6. No leagues, has cards
  if (insights.length < 3 && p.myLeagues.length === 0 && (p.stats?.cards_logged ?? 0) >= 3) {
    insights.push({
      id: 'no-leagues',
      icon: <Trophy size={16} />,
      title: 'Compete in a league',
      body: 'You have cards logged — see how you rank against other shooters at your level.',
      cta: { label: 'Browse leagues', to: '/leagues' },
      variant: 'default',
    })
  }

  return insights.slice(0, 3)
}

// ─── components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtext,
  gold,
  trend,
  trendLabel,
}: {
  label: string
  value: string
  subtext?: string
  gold?: boolean
  trend?: 'up' | 'down' | null
  trendLabel?: string
}) {
  return (
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5 flex flex-col">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-2xl lg:text-3xl font-mono font-normal mt-1 ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-[11px] text-muted mt-1 leading-snug">{subtext}</p>
      )}
      {trend && trendLabel && (
        <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-mono ${trend === 'up' ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'}`}>
          {trend === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  )
}

function ScoreBar({ score, max = 250 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100))
  return (
    <div className="relative h-1 w-full rounded-full bg-surface-hover overflow-hidden mt-2">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[var(--brass)]/35"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function InsightCard({ icon, title, body, cta, variant = 'default' }: {
  icon: React.ReactNode
  title: string
  body: string
  cta?: { label: string; to: string; params?: Record<string, string> }
  variant?: 'default' | 'highlight'
}) {
  const outer = variant === 'highlight'
    ? 'border-[var(--brass)]/30 bg-[var(--brass)]/5 hover:border-[var(--brass)]/50'
    : 'border-subtle bg-surface hover:border-[var(--brass)]/20'

  const inner = (
    <div className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${outer}`}>
      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--brass)]/10 text-[var(--brass)] mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-secondary">{title}</p>
        <p className="text-[11px] text-muted leading-relaxed mt-0.5">{body}</p>
        {cta && (
          <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity mt-2 inline-block">
            {cta.label} →
          </span>
        )}
      </div>
    </div>
  )

  if (!cta) return inner

  // Cast to any to satisfy TanStack Router's strict params typing at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Link to={cta.to as any} params={cta.params as any}>{inner}</Link>
}

function ActivityCard({ card, avgScore, scoreMax }: {
  card: ScoreCardSummary
  avgScore?: number
  scoreMax: number
}) {
  const delta = avgScore != null ? scoreDelta(card.total_score, avgScore) : null
  const deltaColour =
    delta?.sign === 'pos' ? 'text-[var(--success-text)]' :
    delta?.sign === 'neg' ? 'text-[var(--error-text)]' :
    'text-muted'

  return (
    <Link
      to="/scores/$id"
      params={{ id: card.id }}
      className="flex flex-col p-3 lg:p-4 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-secondary text-sm">{formatDate(card.shot_at)}</p>
          {card.location && (
            <p className="text-[11px] text-muted truncate mt-0.5">{card.location}</p>
          )}
        </div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono text-xl font-semibold text-primary">{card.total_score}</span>
          {card.x_count > 0 && (
            <span className="text-xs text-[var(--brass)] font-mono">{card.x_count}X</span>
          )}
          {delta && (
            <span className={`text-[10px] font-mono ${deltaColour}`}>{delta.label}</span>
          )}
        </div>
      </div>
      <ScoreBar score={card.total_score} max={scoreMax} />
    </Link>
  )
}

function PlatformRifleRow({ rs, globalBest }: { rs: EnrichedRifleStats; globalBest: number }) {
  return (
    <Link
      to="/scores"
      className="flex flex-col p-3 lg:p-4 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-subtle shrink-0 bg-surface-hover">
          {rs.image_url ? (
            <img src={rs.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package size={14} className="text-muted opacity-40" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-secondary font-medium truncate">{rs.make} {rs.model}</p>
          <p className="text-[11px] text-muted">{rs.calibre} · {rs.card_count} card{rs.card_count !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right shrink-0 font-mono">
          <span className="text-xl font-semibold text-[var(--brass)]">{rs.best_score}</span>
          {rs.best_x_count > 0 && (
            <span className="text-xs text-[var(--brass)]/70 ml-1">{rs.best_x_count}X</span>
          )}
        </div>
      </div>
      <ScoreBar score={rs.best_score} max={globalBest} />
    </Link>
  )
}

function EmptySection({ icon, heading, body, cta }: {
  icon: React.ReactNode
  heading: string
  body: string
  cta: { label: string; to: string }
}) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link to={cta.to as any} className="flex flex-col items-center text-center gap-3 p-6 border border-dashed border-subtle rounded-lg hover:border-[var(--brass)]/30 transition-colors block">
      <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-muted">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-secondary">{heading}</p>
        <p className="text-[11px] text-muted leading-relaxed max-w-[240px] mx-auto">{body}</p>
      </div>
      <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity">
        {cta.label} →
      </span>
    </Link>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

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

  const rifleMap = new Map<string, Rifle>()
  for (const r of riflesData?.items ?? []) rifleMap.set(r.id, r)

  const enrichedRifleStats: EnrichedRifleStats[] = rifleStats
    .map((rs: RifleStats) => {
      const rifle = rifleMap.get(rs.rifle_id)
      return rifle
        ? { ...rs, make: rifle.make, model: rifle.model, image_url: rifle.image_url, calibre: rifle.calibre }
        : null
    })
    .filter(Boolean)
    .sort((a: EnrichedRifleStats, b: EnrichedRifleStats) => b.best_score - a.best_score) as EnrichedRifleStats[]

  const initials = user?.display_name
    ?.split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? ''

  // Trend: compare most recent card vs oldest in recent set
  const trendDelta: number | null =
    recentCards.length >= 2
      ? recentCards[0].total_score - recentCards[recentCards.length - 1].total_score
      : null

  const scoreMax = Math.max(
    ...recentCards.map(c => c.total_score),
    stats?.best_score ?? 0,
    250,
  )

  const globalBest = enrichedRifleStats.length > 0
    ? Math.max(...enrichedRifleStats.map(r => r.best_score))
    : 250

  const insights = computeInsights({
    stats,
    recentCards,
    rifles,
    rifleStats,
    enrichedRifleStats,
    myLeagues,
    pelletTestStats,
  })

  // Sort leagues: active first, upcoming, ended
  const sortedLeagues = [...myLeagues].sort((a, b) => {
    const aActive = leagueIsActive(a) ? 0 : a.starts_on && a.starts_on > new Date().toISOString().slice(0, 10) ? 1 : 2
    const bActive = leagueIsActive(b) ? 0 : b.starts_on && b.starts_on > new Date().toISOString().slice(0, 10) ? 1 : 2
    return aActive - bActive
  })

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-full overflow-hidden border border-subtle shrink-0 bg-surface-hover">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted text-sm font-medium">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-base lg:text-lg font-medium text-primary truncate">{user?.display_name}</p>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted tracking-wide mt-0.5">
              {user?.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} className="opacity-60" />
                  {user.location}
                </span>
              )}
              {user?.club && <span>{user.club}</span>}
              <Link to="/profile" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
                Edit profile →
              </Link>
            </div>
          </div>
        </div>
        <Link
          to="/scores/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brass)]/15 border border-[var(--brass)]/30 text-[var(--brass)] text-[11px] tracking-widest uppercase font-medium hover:bg-[var(--brass)]/25 transition-colors shrink-0"
        >
          <Plus size={13} />
          Log Card
        </Link>
      </div>

      {/* ── Stats grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="Best Score"
          value={stats?.best_score != null ? String(stats.best_score) : '—'}
          subtext={stats?.best_score != null ? 'Personal best' : 'No sessions yet'}
          gold
        />
        <StatCard
          label="Best X Count"
          value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'}
          subtext={stats?.best_x_count != null ? 'Highest inner-tens' : 'No sessions yet'}
          gold
        />
        <StatCard
          label="Cards Logged"
          value={stats ? String(stats.cards_logged) : '—'}
          subtext={stats && stats.cards_logged > 0 ? 'Sessions recorded' : 'Start logging'}
        />
        <StatCard
          label="Avg Score"
          value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
          subtext={stats?.avg_score != null ? 'Rolling average' : 'Log 1 card to calculate'}
          trend={trendDelta != null ? (trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : null) : null}
          trendLabel={
            trendDelta != null && Math.abs(trendDelta) >= 1
              ? `${trendDelta > 0 ? '+' : ''}${trendDelta} over last ${recentCards.length}`
              : undefined
          }
        />
      </div>

      {/* ── Insights ───────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div>
          <p className="text-[10px] tracking-widest uppercase text-muted mb-3">Insights</p>
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                icon={insight.icon}
                title={insight.title}
                body={insight.body}
                cta={insight.cta}
                variant={insight.variant}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Platform Performance ───────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] tracking-widest uppercase text-muted">Platform Performance</h2>
          <Link
            to="/gear"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            Manage gear →
          </Link>
        </div>

        {rifles.length === 0 ? (
          <EmptySection
            icon={<Package size={20} />}
            heading="Add your rifles"
            body="Track each platform independently. See which rifle is producing your best scores and how many cards you've logged per setup."
            cta={{ label: 'Add rifle', to: '/gear' }}
          />
        ) : enrichedRifleStats.length === 0 ? (
          <div>
            {/* Show rifles without stats yet */}
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 mb-3">
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
            <p className="text-[11px] text-muted tracking-wide">
              Log cards with a rifle selected to build per-platform stats.
            </p>
          </div>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {enrichedRifleStats.map(rs => (
              <PlatformRifleRow key={rs.rifle_id} rs={rs} globalBest={globalBest} />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Activity ────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] tracking-widest uppercase text-muted">Recent Activity</h2>
          <div className="flex items-center gap-3">
            <Link
              to="/scores/trends"
              className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
              Trends →
            </Link>
            <Link
              to="/scores/new"
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              <Plus size={12} />
              Log
            </Link>
          </div>
        </div>

        {recentCards.length === 0 ? (
          <EmptySection
            icon={<Target size={20} />}
            heading="No sessions logged yet"
            body="Log your first card to start tracking scores, spotting trends, and building your performance history."
            cta={{ label: 'Log first card', to: '/scores/new' }}
          />
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recentCards.map(card => (
              <ActivityCard
                key={card.id}
                card={card}
                avgScore={stats?.avg_score}
                scoreMax={scoreMax}
              />
            ))}
            {stats && stats.cards_logged > 5 && (
              <Link
                to="/scores"
                className="block text-center text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors pt-1 lg:col-span-2"
              >
                View all {stats.cards_logged} sessions →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── Ammunition Intelligence ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] tracking-widest uppercase text-muted">Ammunition Intelligence</h2>
          <Link
            to="/pellet-testing"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            All tests →
          </Link>
        </div>

        {!pelletTestStats || pelletTestStats.total_tests === 0 ? (
          <EmptySection
            icon={<Crosshair size={20} />}
            heading="No ammunition tests yet"
            body="Systematic pellet testing reveals which ammo tightens your groups. Even a single session produces actionable data."
            cta={{ label: 'Start testing', to: '/pellet-testing' }}
          />
        ) : (
          <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
            <div className="grid grid-cols-3 divide-x divide-subtle">
              <div className="pr-4 space-y-1">
                <p className="text-[10px] tracking-widest uppercase text-muted">Sessions</p>
                <p className="text-2xl lg:text-3xl font-mono text-secondary">{pelletTestStats.total_tests}</p>
                <p className="text-[11px] text-muted">test sessions logged</p>
              </div>
              <div className="px-4 space-y-1">
                <p className="text-[10px] tracking-widest uppercase text-muted">Best Group</p>
                <p className="text-2xl lg:text-3xl font-mono text-[var(--brass)]">
                  {pelletTestStats.best_group_mm != null ? `${pelletTestStats.best_group_mm.toFixed(2)}mm` : '—'}
                </p>
                <p className="text-[11px] text-muted">tightest group measured</p>
              </div>
              <div className="pl-4 space-y-1 min-w-0">
                <p className="text-[10px] tracking-widest uppercase text-muted">Top Pellet</p>
                <p className="text-lg lg:text-xl font-mono text-secondary truncate">
                  {pelletTestStats.most_tested_pellet ?? '—'}
                </p>
                <p className="text-[11px] text-muted">most frequently tested</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Competition ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] tracking-widest uppercase text-muted">Competition</h2>
          <Link
            to="/leagues"
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            Browse →
          </Link>
        </div>

        {sortedLeagues.length === 0 ? (
          <EmptySection
            icon={<Trophy size={20} />}
            heading="Not competing yet"
            body="Join a league to benchmark your scores against other shooters. Private leagues are available for club use."
            cta={{ label: 'Browse leagues', to: '/leagues' }}
          />
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {sortedLeagues.map((league: MyLeagueSummary) => {
              const timing = leagueTimingBadge(league.starts_on, league.ends_on)
              const pct = league.member_count >= 5 && league.user_rank > 0
                ? Math.round((league.user_rank / league.member_count) * 100)
                : null
              return (
                <Link
                  key={league.id}
                  to="/leagues/$id"
                  params={{ id: league.id }}
                  className="flex items-center gap-3 p-3 lg:p-4 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
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
                      <Users size={10} />
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
                        {pct != null && (
                          <p className="text-[10px] text-muted mt-0.5">top {pct}%</p>
                        )}
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

    </div>
  )
}
