import { Target, Package, Crosshair, Trophy, TrendingUp } from 'lucide-react'
import type { UserStats, RifleStats } from '../api/stats'
import type { ScoreCardSummary } from '../api/scoreCards'
import type { Rifle } from '../api/gear'
import type { MyLeagueSummary } from '../api/leagues'
import type { PelletTestStats } from '../api/pelletTesting'
import { toDate } from '../utils/date'

// Pure Dashboard helpers, kept out of Dashboard.tsx so they can carry a named
// export (react-refresh/only-export-components requires a component file to
// export only components) and be unit tested directly.

export function leagueIsActive(l: MyLeagueSummary): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (l.starts_on && l.starts_on > today) return false
  if (l.ends_on && l.ends_on < today) return false
  return true
}

// `ends_on` is a bare YYYY-MM-DD calendar date. Parsing it with `new
// Date(string)` reads it as UTC midnight, which for anyone west of UTC lands
// several hours into the *previous* local day — the countdown then runs
// short by up to a day depending on the viewer's timezone. `toDate` (see
// utils/date.ts) parses it as local midnight instead, matching how the rest
// of the app already treats bare calendar dates.
function daysUntil(dateStr: string): number {
  const d = toDate(dateStr)
  return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : Infinity
}

export interface Insight {
  id: string
  icon: React.ReactNode
  title: string
  body: string
  cta?: { label: string; to: string; params?: Record<string, string> }
}

export type EnrichedRifleStats = RifleStats & { make: string; model: string; image_url?: string; calibre: string }

export function computeInsights(p: {
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
      return daysUntil(l.ends_on) <= 7 && leagueIsActive(l)
    })
    if (urgent) {
      const daysLeft = daysUntil(urgent.ends_on!)
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
