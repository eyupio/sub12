import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Users, Package, Target,
  TrendingUp, Crosshair, Trophy, MapPin,
  FlaskConical, Sparkles, Bell,
} from 'lucide-react'
import { statsApi, UserStats, RifleStats } from '../api/stats'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { gearApi, Rifle } from '../api/gear'
import { leagueApi, MyLeagueSummary } from '../api/leagues'
import { clubsApi, Club } from '../api/clubs'
import { pelletTestApi, PelletTestStats, ComboPerformanceSummary } from '../api/pelletTesting'
import { activityApi, ActivityItem as FeedItem } from '../api/activity'
import { useAuthStore } from '../store/auth'
import { UserAvatar } from '../components/UserAvatar'
import { formatDate, useRegionalPrefs } from '../utils/date'
import {
  Section,
  SectionAction,
  StatTile,
  RifleCard,
  ActivityRow,
  ActivityItem as DashActivityItem,
  NoticeCard,
  StatsStrip,
  MiniEntityCard,
  TrendPill,
} from '../components/dashboard'

// ─── helpers ────────────────────────────────────────────────────────────────

function leagueIsActive(l: MyLeagueSummary): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (l.starts_on && l.starts_on > today) return false
  if (l.ends_on && l.ends_on < today) return false
  return true
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toISOString().slice(0, 10)
}

// ─── insight engine (kept from previous Dashboard) ──────────────────────────

interface Insight {
  id: string
  icon: React.ReactNode
  title: string
  body: string
  cta?: { label: string; to: string; params?: Record<string, string> }
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
      })
    }
  }

  if (p.rifles.length > 0 && p.enrichedRifleStats.length === 0) {
    insights.push({
      id: 'no-rifle-stats',
      icon: <Package size={16} />,
      title: 'Link a rifle to your next card',
      body: 'Assigning a rifle unlocks per-platform analysis and shows which setup is performing best.',
      cta: { label: 'Log card', to: '/scores/new' },
    })
  }

  if (insights.length < 4) {
    const untested = p.rifles.find(r => !p.rifleStats.some(rs => rs.rifle_id === r.id))
    if (untested) {
      insights.push({
        id: 'untested-rifle',
        icon: <Package size={16} />,
        title: `${untested.make} ${untested.model} has no data yet`,
        body: 'Log a card with this rifle to start building per-platform performance history.',
        cta: { label: 'Log card', to: '/scores/new' },
      })
    }
  }

  if (insights.length < 4 && p.rifles.length > 0 && (p.pelletTestStats?.total_tests ?? 0) === 0) {
    insights.push({
      id: 'no-ammo-test',
      icon: <Crosshair size={16} />,
      title: 'Ammunition untested',
      body: 'Pellet selection can account for significant group-size variation. Start a test session to find your optimal load.',
      cta: { label: 'Start test', to: '/pellet-testing' },
    })
  }

  if (insights.length < 4) {
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
      })
    }
  }

  if (insights.length < 4 && p.myLeagues.length === 0 && (p.stats?.cards_logged ?? 0) >= 3) {
    insights.push({
      id: 'no-leagues',
      icon: <Trophy size={16} />,
      title: 'Compete in a league',
      body: 'You have cards logged — see how you rank against other shooters at your level.',
      cta: { label: 'Browse leagues', to: '/leagues' },
    })
  }

  if (
    insights.length < 4 &&
    p.recentCards.length >= 3 &&
    p.stats?.avg_score != null
  ) {
    const last3 = p.recentCards.slice(0, 3)
    const avg = p.stats.avg_score
    if (last3.every(c => c.total_score > avg)) {
      const lowest = Math.min(...last3.map(c => c.total_score))
      insights.push({
        id: 'positive-trend',
        icon: <TrendingUp size={16} />,
        title: "You're above average for 3 in a row",
        body: `Your last three cards are all above your rolling average (${avg.toFixed(1)}). Lowest was ${lowest} — you're trending up.`,
        cta: { label: 'View trends', to: '/scores/trends' },
      })
    }
  }

  return insights.slice(0, 4)
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const prefs = useRegionalPrefs()

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getMe(),
  })

  const { data: history } = useQuery({
    queryKey: ['score-cards', 20],
    queryFn: () => scoreCardApi.list(20, 0),
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

  const { data: myClubsData } = useQuery({
    queryKey: ['my-clubs'],
    queryFn: () => clubsApi.listMine(),
  })

  const { data: pelletTestStats } = useQuery({
    queryKey: ['pellet-test-stats'],
    queryFn: () => pelletTestApi.stats(),
  })

  const { data: comboData } = useQuery({
    queryKey: ['combo-analytics'],
    queryFn: () => pelletTestApi.comboAnalytics(),
  })

  const { data: feedData } = useQuery({
    queryKey: ['feed', 'for_you', 20],
    queryFn: () => activityApi.getFeed(20, undefined, 'for_you'),
  })

  const recentCards = history?.items ?? []
  const rifles = riflesData?.items?.filter((r: Rifle) => r.is_active) ?? []
  const rifleStats = rifleStatsData?.items ?? []
  const myLeagues = myLeaguesData?.items ?? []
  const myClubs = myClubsData?.items ?? []
  const feedItems = feedData?.items ?? []

  const rifleMap = new Map<string, Rifle>()
  for (const r of riflesData?.items ?? []) rifleMap.set(r.id, r)

  const enrichedRifleStats: EnrichedRifleStats[] = rifleStats
    .flatMap((rs: RifleStats): EnrichedRifleStats[] => {
      const rifle = rifleMap.get(rs.rifle_id)
      return rifle
        ? [{ ...rs, make: rifle.make, model: rifle.model, image_url: rifle.image_url, calibre: rifle.calibre }]
        : []
    })
    .sort((a, b) => b.best_score - a.best_score)

  const trendDelta: number | null =
    recentCards.length >= 2
      ? recentCards[0].total_score - recentCards[recentCards.length - 1].total_score
      : null

  const insights = computeInsights({
    stats,
    recentCards,
    rifles,
    rifleStats,
    enrichedRifleStats,
    myLeagues,
    pelletTestStats,
  })

  const sortedLeagues = [...myLeagues].sort((a, b) => {
    const today = new Date().toISOString().slice(0, 10)
    const score = (l: MyLeagueSummary) =>
      leagueIsActive(l) ? 0 : l.starts_on && l.starts_on > today ? 1 : 2
    return score(a) - score(b)
  })

  const mostUsedRifle = enrichedRifleStats.length > 0
    ? [...enrichedRifleStats].sort((a, b) => b.card_count - a.card_count)[0]
    : undefined

  const topCombo: ComboPerformanceSummary | undefined = comboData?.items?.[0]

  // Build first 2 RifleCards for the 2-up grid: rifles with stats first, then untouched ones.
  const rifleCards = (() => {
    const withStats = enrichedRifleStats
      .map(rs => {
        const r = rifleMap.get(rs.rifle_id)
        if (!r) return null
        return {
          rifle: r,
          stats: rs,
          hasData: true,
        }
      })
      .filter((x): x is { rifle: Rifle; stats: EnrichedRifleStats; hasData: true } => !!x)
    const without = rifles
      .filter(r => !enrichedRifleStats.some(rs => rs.rifle_id === r.id))
      .map(r => ({ rifle: r, stats: null, hasData: false as const }))
    return [...withStats, ...without].slice(0, 2)
  })()

  // Combined activity stream
  const ownStream: DashActivityItem[] = recentCards.slice(0, 6).map((c): DashActivityItem => ({
    kind: 'score',
    id: c.id,
    date: c.shot_at,
    score: c.total_score,
    x: c.x_count,
    delta:
      stats?.avg_score != null ? c.total_score - stats.avg_score : null,
    to: '/scores/$id',
  }))

  const socialStream: DashActivityItem[] = feedItems
    .filter((f: FeedItem) => f.user_id !== user?.id)
    .filter((f: FeedItem) =>
      ['score_posted', 'post_created', 'pellet_test_posted'].includes(f.type),
    )
    .filter((f: FeedItem) => Boolean(f.league_id || f.club_id))
    .slice(0, 6)
    .map((f: FeedItem): DashActivityItem => ({
      kind: 'post',
      id: f.id,
      who: f.display_name,
      whoId: f.user_id,
      avatarUrl: f.avatar_url,
      whereName: f.metadata?.league_name ?? f.metadata?.club_name,
      whereType: f.league_id ? 'league' : 'club',
      whereId: f.league_id ?? f.club_id,
      date: f.created_at,
      score: f.metadata?.total_score,
      x: f.metadata?.x_count,
      body: f.metadata?.body_preview,
      likeCount: f.like_count,
      commentCount: f.comment_count,
    }))

  const activityStream = [...ownStream, ...socialStream]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6)

  // Pellet performance cells
  const pelletCells = pelletTestStats && pelletTestStats.total_tests > 0
    ? [
        {
          label: 'Sessions',
          value: String(pelletTestStats.total_tests),
          sub: 'test sessions logged',
        },
        {
          label: 'Best Group',
          value: pelletTestStats.best_group_mm != null ? `${pelletTestStats.best_group_mm.toFixed(2)}mm` : '—',
          sub: 'tightest group measured',
          highlight: true,
        },
        {
          label: 'Avg Group',
          value: pelletTestStats.avg_group_mm != null ? `${pelletTestStats.avg_group_mm.toFixed(2)}mm` : '—',
          sub: 'average across sessions',
        },
        {
          label: 'Most Tested',
          value: pelletTestStats.most_tested_pellet ?? '—',
          sub: 'pellet with most sessions',
        },
      ]
    : null

  const trackingContext = (() => {
    const c = stats?.cards_logged ?? 0
    const r = rifles.length
    if (c === 0 && r === 0) return null
    if (c === 0) return `${r} rifle${r !== 1 ? 's' : ''} added`
    if (r === 0) return `${c} card${c !== 1 ? 's' : ''} logged`
    return `Tracking ${c} card${c !== 1 ? 's' : ''} across ${r} rifle${r !== 1 ? 's' : ''}`
  })()

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5 lg:space-y-6">

      {/* ── Profile header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            user={user ?? {}}
            size={36}
            className="shrink-0"
            showHoverCard={false}
          />
          <div className="min-w-0">
            <p className="font-serif-display text-[22px] leading-tight text-ink truncate">
              {user?.display_name}
              <Link to="/profile" className="ml-3 align-middle font-sans text-[10px] tracking-[0.18em] uppercase text-gold hover:text-gold-2 transition-colors">
                Edit profile →
              </Link>
            </p>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted mt-1 font-mono">
              {user?.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} className="opacity-60" />
                  {user.location}
                </span>
              )}
              {user?.club && <span>· {user.club}</span>}
            </div>
            {trackingContext && (
              <p className="text-[11px] text-muted mt-0.5">{trackingContext}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Link
            to="/scores/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] bg-gold text-white text-[10px] tracking-[0.18em] uppercase font-medium hover:bg-gold-2 transition-colors shadow-card"
          >
            <Plus size={12} />
            Log Score
          </Link>
          <Link
            to="/pellet-testing/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-line text-muted text-[10px] tracking-[0.18em] uppercase font-medium hover:text-ink hover:border-line-2 transition-colors"
          >
            <FlaskConical size={12} />
            Pellet Test
          </Link>
          <Link
            to="/gear"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-line text-muted text-[10px] tracking-[0.18em] uppercase font-medium hover:text-ink hover:border-line-2 transition-colors"
          >
            <Plus size={12} />
            Add Rifle
          </Link>
        </div>
      </div>

      {/* ── Hero stat tiles ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatTile
          label="Best Score"
          value={stats?.best_score != null ? String(stats.best_score) : '—'}
          sub={stats?.best_score != null ? 'Personal best' : 'No sessions yet'}
          gold
          to={stats?.best_score_card_id ? '/scores/$id' : stats?.best_score != null ? '/scores/trends' : undefined}
          params={stats?.best_score_card_id ? { id: stats.best_score_card_id } : undefined}
        />
        <StatTile
          label="Best Group"
          value={pelletTestStats?.best_group_mm != null ? pelletTestStats.best_group_mm.toFixed(2) : '—'}
          unit={pelletTestStats?.best_group_mm != null ? 'mm' : undefined}
          sub={pelletTestStats?.best_group_mm != null ? 'Tightest group measured' : 'No tests yet'}
          gold={pelletTestStats?.best_group_mm != null}
          to={pelletTestStats?.best_group_test_id ? '/pellet-testing/$id' : pelletTestStats?.best_group_mm != null ? '/pellet-testing/leaderboard' : undefined}
          params={pelletTestStats?.best_group_test_id ? { id: pelletTestStats.best_group_test_id } : undefined}
        />
        <StatTile
          label="Cards Logged"
          value={stats ? String(stats.cards_logged) : '—'}
          sub={stats && stats.cards_logged > 0 ? 'Total sessions recorded' : 'Start logging'}
          to={stats && stats.cards_logged > 0 ? '/scores' : undefined}
        />
        <StatTile
          label={stats?.rolling_10_avg != null ? 'Recent Form' : 'Avg Score'}
          value={stats?.rolling_10_avg != null ? stats.rolling_10_avg.toFixed(1) : stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
          sub={stats?.rolling_10_avg != null ? 'Rolling 10-card average' : stats?.avg_score != null ? `Across ${recentCards.length} cards` : 'Log 1 card to calculate'}
          trend={
            trendDelta != null && Math.abs(trendDelta) >= 1 ? (
              <TrendPill delta={trendDelta} suffix={`over last ${recentCards.length}`} precision={0} />
            ) : undefined
          }
          to={stats?.rolling_10_avg != null || stats?.avg_score != null ? '/scores/trends' : undefined}
        />
      </div>

      {/* ── Secondary compact tiles ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatTile
          compact
          label="Top Combo"
          value={topCombo ? `${topCombo.rifle_name} + ${topCombo.pellet_name}` : '—'}
          sub={topCombo
            ? `${topCombo.avg_group_mm != null ? `${topCombo.avg_group_mm.toFixed(2)}mm avg · ` : ''}${topCombo.test_count} test${topCombo.test_count !== 1 ? 's' : ''}`
            : 'No tests yet'}
          to={topCombo ? '/pellet-testing/combo-analytics' : undefined}
        />
        <StatTile
          compact
          label="Most Used Rifle"
          value={mostUsedRifle ? `${mostUsedRifle.make} ${mostUsedRifle.model}` : '—'}
          sub={mostUsedRifle
            ? `${mostUsedRifle.card_count} card${mostUsedRifle.card_count !== 1 ? 's' : ''}`
            : 'No data yet'}
          to={mostUsedRifle ? '/scores/trends' : undefined}
          search={mostUsedRifle ? { rifleId: mostUsedRifle.rifle_id } : undefined}
        />
        <StatTile
          compact
          label="Best Group"
          value={pelletTestStats?.best_group_mm != null ? pelletTestStats.best_group_mm.toFixed(2) : '—'}
          unit={pelletTestStats?.best_group_mm != null ? 'mm' : undefined}
          sub="tightest measured"
          gold={pelletTestStats?.best_group_mm != null}
          to={pelletTestStats?.best_group_test_id ? '/pellet-testing/$id' : pelletTestStats?.best_group_mm != null ? '/pellet-testing/leaderboard' : undefined}
          params={pelletTestStats?.best_group_test_id ? { id: pelletTestStats.best_group_test_id } : undefined}
        />
        <StatTile
          compact
          label="Avg Group"
          value={pelletTestStats?.avg_group_mm != null ? pelletTestStats.avg_group_mm.toFixed(2) : '—'}
          unit={pelletTestStats?.avg_group_mm != null ? 'mm' : undefined}
          sub="across all sessions"
          to={pelletTestStats?.avg_group_mm != null ? '/pellet-testing' : undefined}
        />
      </div>

      {/* ── Worth Noticing ───────────────────────────────────────── */}
      {insights.length > 0 && (
        <Section title="Worth Noticing" icon={<Sparkles size={11} className="text-gold" />}>
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {insights.map(ins => (
              <NoticeCard
                key={ins.id}
                icon={ins.icon}
                title={ins.title}
                body={ins.body}
                cta={ins.cta}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Rifle Performance ────────────────────────────────────── */}
      <Section
        title="Rifle Performance"
        icon={<Package size={11} className="text-gold" />}
        actions={<SectionAction to="/gear">Manage Gear →</SectionAction>}
      >
        {rifles.length === 0 ? (
          <p className="text-[12px] text-muted text-center py-6">
            No rifles yet. <Link to="/gear" className="text-gold hover:text-gold-2">Add your first rifle →</Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line border border-line rounded-[10px] overflow-hidden">
            {rifleCards.map(({ rifle, stats: rs, hasData }) => (
              <RifleCard
                key={rifle.id}
                name={`${rifle.make} ${rifle.model}`}
                spec={`${rifle.calibre}${rifle.power_ftlb ? ` · ${rifle.power_ftlb} ft·lb` : ''}`}
                imageUrl={rifle.image_url}
                cardsLogged={hasData ? rs.card_count : null}
                shotsFired={hasData ? rs.card_count * 25 : null}
                bestScore={hasData ? rs.best_score : null}
                bestXCount={hasData ? rs.best_x_count : null}
                hasData={hasData}
              />
            ))}
            {rifleCards.length === 1 && (
              <div className="hidden md:flex items-center justify-center text-[11px] text-muted px-6 py-10">
                Only one rifle tracked yet.
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Leagues + Clubs (high-priority row) ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <Section
          title="My Leagues"
          icon={<Trophy size={11} className="text-gold" />}
          actions={<SectionAction to="/leagues">Browse →</SectionAction>}
        >
          {sortedLeagues.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-4">
              Not in any leagues yet. <Link to="/leagues" className="text-gold hover:text-gold-2">Browse leagues →</Link>
            </p>
          ) : (
            <div className="-mx-4 -my-2">
              {sortedLeagues.slice(0, 4).map((l) => (
                <MiniEntityCard
                  key={l.id}
                  name={l.name}
                  imageUrl={l.image_url}
                  metaIcon={<Users size={10} />}
                  metaLabel={`${l.member_count}`}
                  rank={l.user_rank > 0 ? l.user_rank : undefined}
                  total={l.member_count}
                  to="/leagues/$id"
                  params={{ id: l.id }}
                  thumbIcon={<Trophy size={16} />}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="My Clubs"
          icon={<Users size={11} className="text-gold" />}
          actions={<SectionAction to="/clubs">Browse →</SectionAction>}
        >
          {myClubs.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-4">
              Not in any clubs yet. <Link to="/clubs" className="text-gold hover:text-gold-2">Browse clubs →</Link>
            </p>
          ) : (
            <div className="-mx-4 -my-2">
              {myClubs.slice(0, 4).map((c: Club) => (
                <MiniEntityCard
                  key={c.id}
                  name={c.name}
                  imageUrl={c.image_url}
                  metaIcon={<Users size={10} />}
                  metaLabel={`${c.member_count}`}
                  to="/clubs/$id"
                  params={{ id: c.id }}
                  thumbIcon={<Users size={16} />}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Recent Activity (combined feed) ──────────────────────── */}
      <Section
        title="Recent Activity"
        icon={<Bell size={11} className="text-gold" />}
        actions={
          <>
            <SectionAction to="/scores/trends" variant="outline">Trends</SectionAction>
            <SectionAction to="/scores/new" icon={<Plus size={10} className="-mr-0.5" />}>Log</SectionAction>
          </>
        }
      >
        {activityStream.length === 0 ? (
          <p className="text-[12px] text-muted text-center py-6">
            No recent activity. <Link to="/scores/new" className="text-gold hover:text-gold-2">Log your first card →</Link>
          </p>
        ) : (
          <div className="-mx-4 -my-2">
            {activityStream.map(item => (
              <ActivityRow
                key={`${item.kind}-${item.id}`}
                item={item}
                scoreIcon={<Target size={13} />}
                formatRelative={(iso) => formatRelative(iso) + (item.kind === 'score' ? ` · ${formatDate(iso, prefs)}` : '')}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ── Pellet Performance ───────────────────────────────────── */}
      <Section
        title="Pellet Performance"
        icon={<Crosshair size={11} className="text-gold" />}
        actions={
          <>
            {pelletCells && (
              <SectionAction to="/pellet-testing/compare" variant="outline">Compare</SectionAction>
            )}
            <SectionAction to="/pellet-testing">All Tests →</SectionAction>
          </>
        }
      >
        {pelletCells ? (
          <StatsStrip cells={pelletCells} />
        ) : (
          <p className="text-[12px] text-muted text-center py-6">
            No pellet tests yet. <Link to="/pellet-testing" className="text-gold hover:text-gold-2">Start your first test →</Link>
          </p>
        )}
      </Section>

    </div>
  )
}
