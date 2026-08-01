import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award, BarChart3, ChevronLeft, Crosshair, Eye, EyeOff, Info, Layers,
  Package, Target, TrendingUp, Trophy, Users,
} from 'lucide-react'
import {
  gearApi,
  type GearCommunity, type GearLeader, type GearGroupLeader,
  type GearPairing, type GearPersonalStats, type GearRecentCard,
  type RifleShowcase as RifleShowcaseData,
} from '../api/gear'
import {
  ChartFrame, DistributionChart, GroupTrendChart, ScoreTrendChart, ShotBreakdownChart,
  SERIES_COMMUNITY, SERIES_YOU,
} from '../components/GearCharts'
import { UserAvatar } from '../components/UserAvatar'
import { rifleImage, pelletImage, UNKNOWN_BRAND_IMAGE } from '../catalog/brandImages'
import { toast } from '../store/toast'

type Tab = 'performance' | 'comparison' | 'pairings'

const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'comparison', label: 'Comparison', icon: Users },
  { id: 'pairings', label: 'Pairings', icon: Layers },
]

// ─── Formatting ──────────────────────────────────────────────────────────────

const num = (v: number | undefined, digits = 0) => v == null ? '—' : v.toFixed(digits)
const mm = (v: number | undefined) => v == null ? '—' : `${v.toFixed(2)} mm`

function formatDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Top 8%" reads better than a raw percentile, and matches how shooters talk. */
function topPercentLabel(percentile: number) {
  const top = Math.max(1, Math.round(100 - percentile))
  return `Top ${top}%`
}

// ─── Shared building blocks ──────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-surface border border-subtle rounded-lg px-3 py-2.5 space-y-0.5">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`t-mono text-lg leading-tight ${accent ? 'text-[var(--brass)]' : 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted tracking-wide">{sub}</p>}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-hover px-2.5 py-1 text-[11px] tracking-wide text-secondary">
      {children}
    </span>
  )
}

function SectionCard({ title, icon: Icon, hint, children }: {
  title: string
  icon?: typeof BarChart3
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-section-title flex items-center gap-1.5">
          {Icon && <Icon size={13} aria-hidden="true" />} {title}
        </h2>
        {hint && <p className="text-[10px] text-muted tracking-wide">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Percentile dial. The arc is the viewer's standing among every opted-in owner
 * of the same model, with the figure repeated as text so the reading never
 * depends on the arc alone.
 */
function PercentileDial({ percentile, rank, owners }: { percentile: number; rank?: number; owners: number }) {
  const size = 132
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = Math.PI * radius // half circle
  const filled = (Math.min(100, Math.max(0, percentile)) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`} role="img"
        aria-label={`You are in the ${topPercentLabel(percentile).toLowerCase()} of ${owners} shooters running this model`}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke="var(--color-border-subtle, #333)" strokeWidth={stroke} strokeLinecap="round" opacity={0.5}
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke={SERIES_YOU} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <p className="t-mono text-2xl text-[var(--brass)] -mt-6">{topPercentLabel(percentile)}</p>
      <p className="text-[11px] text-muted tracking-wide mt-1">
        {rank != null ? `Rank ${rank} of ${owners}` : `${owners} shooters`}
      </p>
    </div>
  )
}

/**
 * One "you vs community" row. The bar is a share of whichever side is larger,
 * so the two are always directly comparable, and both numbers are printed.
 */
function VersusRow({ label, you, them, format, lowerIsBetter }: {
  label: string
  you?: number
  them?: number
  format: (v: number | undefined) => string
  lowerIsBetter?: boolean
}) {
  const max = Math.max(you ?? 0, them ?? 0) || 1
  const youPct = ((you ?? 0) / max) * 100
  const themPct = ((them ?? 0) / max) * 100

  const ahead = you != null && them != null && (lowerIsBetter ? you < them : you > them)
  const behind = you != null && them != null && (lowerIsBetter ? you > them : you < them)

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] tracking-wide text-muted">{label}</span>
        <span className="text-[10px] tracking-widest uppercase text-muted">
          {ahead ? 'ahead' : behind ? 'behind' : '—'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] tracking-widest uppercase text-muted">You</span>
          <div className="flex-1 h-2 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${youPct}%`, background: SERIES_YOU }} />
          </div>
          <span className="w-20 shrink-0 text-right t-mono text-xs text-primary">{format(you)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] tracking-widest uppercase text-muted">Others</span>
          <div className="flex-1 h-2 rounded-full bg-surface-hover overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${themPct}%`, background: SERIES_COMMUNITY }} />
          </div>
          <span className="w-20 shrink-0 text-right t-mono text-xs text-secondary">{format(them)}</span>
        </div>
      </div>
    </div>
  )
}

function ScoreLeaderList({ leaders }: { leaders: GearLeader[] }) {
  if (leaders.length === 0) {
    return <p className="text-sm text-muted">No public results for this model yet.</p>
  }
  return (
    <ol className="divide-y divide-[var(--border-subtle)]">
      {leaders.map((l, i) => (
        <li key={l.user_id} className={`flex items-center gap-3 py-2 ${l.is_you ? 'bg-[var(--brass)]/5 -mx-2 px-2 rounded' : ''}`}>
          <span className="w-5 shrink-0 t-mono text-xs text-muted">{i + 1}</span>
          <UserAvatar user={l} size={28} linkToProfile />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-secondary truncate">
              {l.display_name}
              {l.is_you && <span className="ml-1.5 text-[10px] tracking-widest uppercase text-[var(--brass)]">you</span>}
            </p>
            <p className="text-[10px] text-muted tracking-wide">
              {l.card_count} card{l.card_count === 1 ? '' : 's'} · avg {num(l.avg_score, 1)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="t-mono text-sm text-[var(--brass)]">{l.best_score}</p>
            <p className="text-[10px] text-muted">{l.best_x_count}x</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function GroupLeaderList({ leaders }: { leaders: GearGroupLeader[] }) {
  if (leaders.length === 0) {
    return <p className="text-sm text-muted">No public group results for this pellet yet.</p>
  }
  return (
    <ol className="divide-y divide-[var(--border-subtle)]">
      {leaders.map((l, i) => (
        <li key={l.user_id} className={`flex items-center gap-3 py-2 ${l.is_you ? 'bg-[var(--brass)]/5 -mx-2 px-2 rounded' : ''}`}>
          <span className="w-5 shrink-0 t-mono text-xs text-muted">{i + 1}</span>
          <UserAvatar user={l} size={28} linkToProfile />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-secondary truncate">
              {l.display_name}
              {l.is_you && <span className="ml-1.5 text-[10px] tracking-widest uppercase text-[var(--brass)]">you</span>}
            </p>
            <p className="text-[10px] text-muted tracking-wide truncate">
              {l.rifle_name || '—'} · {l.test_count} test{l.test_count === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="t-mono text-sm text-[var(--brass)]">{mm(l.best_group_mm)}</p>
            <p className="text-[10px] text-muted">avg {mm(l.avg_group_mm)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function PairingList({ pairings, emptyLabel, showUsers }: {
  pairings: GearPairing[]
  emptyLabel: string
  showUsers?: boolean
}) {
  if (pairings.length === 0) return <p className="text-sm text-muted">{emptyLabel}</p>

  const max = Math.max(...pairings.map(p => p.card_count + p.test_count), 1)

  return (
    <ul className="space-y-2.5">
      {pairings.map((p, i) => (
        <li key={`${p.name}-${i}`} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-secondary truncate">{p.name}</span>
            <span className="t-mono text-xs text-[var(--brass)] shrink-0">
              {p.avg_score != null ? num(p.avg_score, 1) : mm(p.avg_group_mm)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${((p.card_count + p.test_count) / max) * 100}%`, background: showUsers ? SERIES_COMMUNITY : SERIES_YOU }}
            />
          </div>
          <p className="text-[10px] text-muted tracking-wide">
            {showUsers && `${p.user_count} shooter${p.user_count === 1 ? '' : 's'} · `}
            {p.card_count} card{p.card_count === 1 ? '' : 's'}
            {p.test_count > 0 && ` · ${p.test_count} test${p.test_count === 1 ? '' : 's'}`}
            {p.best_score != null && ` · best ${p.best_score}`}
            {p.best_group_mm != null && ` · best ${mm(p.best_group_mm)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function RecentCardList({ cards }: { cards: GearRecentCard[] }) {
  if (cards.length === 0) return <p className="text-sm text-muted">No cards logged with this gear yet.</p>
  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {cards.map(c => (
        <li key={c.id}>
          <Link
            to="/scores/$id"
            params={{ id: c.id }}
            className="flex items-center gap-3 py-2 hover:bg-surface-hover -mx-2 px-2 rounded transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-secondary">{formatDate(c.shot_at)}</p>
              {c.location && <p className="text-[10px] text-muted tracking-wide truncate">{c.location}</p>}
            </div>
            <span className="t-mono text-sm text-[var(--brass)]">{c.total_score}</span>
            <span className="t-mono text-[11px] text-muted w-8 text-right">{c.x_count}x</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * The opt-in control. Public comparison is a two-way street — opting out stops
 * the item feeding other shooters' aggregates and stops it receiving theirs —
 * so the copy says exactly that rather than hiding it behind a toggle label.
 */
function ComparisonOptInCard({ optedIn, isPending, onToggle }: {
  optedIn: boolean
  isPending: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <section className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${optedIn ? 'bg-[var(--brass)]/15 text-[var(--brass)]' : 'bg-surface-hover text-muted'}`}>
          {optedIn ? <Eye size={15} /> : <EyeOff size={15} />}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="t-subsection-title">
            {optedIn ? 'Included in public comparison' : 'Excluded from public comparison'}
          </h2>
          <p className="t-body-sm text-muted">
            {optedIn
              ? 'Your results with this item are pooled anonymously with other owners of the same model, and you can see how you compare. Only your display name appears, and only on the public leaderboard.'
              : 'This item contributes nothing to other shooters’ comparisons, and no community figures are shown for it here. Your own stats are unaffected.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optedIn}
          aria-label="Include this item in public comparison"
          disabled={isPending}
          onClick={() => onToggle(!optedIn)}
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${optedIn ? 'bg-[var(--brass)]' : 'bg-surface-hover border border-subtle'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${optedIn ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
    </section>
  )
}

/** Shown when a model has too few opted-in owners to anonymise an aggregate. */
function NotEnoughDataCard({ community, modelName }: { community: GearCommunity; modelName: string }) {
  const needed = Math.max(0, community.min_owners - community.owner_count)
  return (
    <section className="bg-surface border border-subtle rounded-lg p-5 text-center space-y-2">
      <Users size={20} className="mx-auto text-muted" aria-hidden="true" />
      <h2 className="t-subsection-title">Not enough shooters yet</h2>
      <p className="t-body-sm text-muted max-w-md mx-auto">
        Comparison needs at least {community.min_owners} opted-in owners of the {modelName} before figures can be
        shown anonymously. {community.owner_count} so far
        {needed > 0 && ` — ${needed} more to go`}.
      </p>
    </section>
  )
}

// ─── Shared layout ───────────────────────────────────────────────────────────

function ShowcaseShell({
  imageSrc, title, subtitle, chips, personal, tab, setTab, children,
}: {
  imageSrc: string
  title: string
  subtitle: string
  chips: React.ReactNode
  personal: GearPersonalStats
  tab: Tab
  setTab: (t: Tab) => void
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5">
      <Link to="/gear" className="inline-flex items-center gap-1 text-muted hover:text-secondary transition-colors text-[11px] tracking-widest uppercase">
        <ChevronLeft size={14} /> Gear
      </Link>

      {/* Hero */}
      <header className="bg-surface border border-subtle rounded-lg overflow-hidden">
        <div className="bg-[var(--brass)]/10 border-b border-[var(--brass)]/20 px-4 py-2">
          <p className="text-[10px] tracking-widest uppercase text-[var(--brass)] text-center font-medium">{subtitle}</p>
        </div>
        <div className="p-4 lg:p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:gap-6">
          <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-full border-2 border-[var(--brass)]/30 overflow-hidden bg-surface-hover shrink-0">
            <img
              src={imageSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).src = UNKNOWN_BRAND_IMAGE }}
            />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
            <h1 className="t-page-title normal-case tracking-normal text-primary">{title}</h1>
            <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">{chips}</div>
            <p className="text-[11px] text-muted tracking-wide">
              In your gear since {formatDate(personal.first_used ?? undefined)}
              {personal.last_used && ` · last used ${formatDate(personal.last_used)}`}
            </p>
          </div>
        </div>
      </header>

      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatTile label="Cards" value={String(personal.card_count)} sub={`${personal.active_days} session${personal.active_days === 1 ? '' : 's'}`} />
        <StatTile label="Shots" value={String(personal.shots_fired)} sub={`${personal.perfect_shots} tens`} />
        <StatTile label="Best" value={personal.best_score != null ? String(personal.best_score) : '—'} sub={personal.best_x_count != null ? `${personal.best_x_count}x` : undefined} accent />
        <StatTile label="Average" value={num(personal.avg_score, 1)} sub={personal.rolling_10_avg != null ? `last 10: ${num(personal.rolling_10_avg, 1)}` : undefined} />
        <StatTile label="Consistency" value={personal.std_dev != null ? `±${num(personal.std_dev, 1)}` : '—'} sub="std deviation" />
        <StatTile label="Best group" value={mm(personal.best_group_mm)} sub={`${personal.test_count} test${personal.test_count === 1 ? '' : 's'}`} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-subtle overflow-x-auto" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={[
              'flex items-center gap-1.5 px-4 py-2 text-[11px] tracking-widest uppercase transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === id ? 'border-[var(--brass)] text-[var(--brass)]' : 'border-transparent text-muted hover:text-secondary',
            ].join(' ')}
          >
            <Icon size={13} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {children}
    </div>
  )
}

function ShowcaseSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 space-y-5">
      <div className="h-40 rounded-lg bg-surface animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />)}
      </div>
      <div className="h-64 rounded-lg bg-surface animate-pulse" />
    </div>
  )
}

function ShowcaseError({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-16 text-center space-y-3">
      <Package size={28} className="mx-auto text-muted" aria-hidden="true" />
      <p className="t-body text-muted">We couldn’t load this {what}.</p>
      <Link to="/gear" className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80">
        Back to gear
      </Link>
    </div>
  )
}

/**
 * The comparison tab is identical for both gear kinds apart from which figures
 * lead — scores for a rifle, group sizes for a pellet.
 */
function ComparisonTab({
  community, personal, modelName, optedIn, isPending, onToggle, kind, mineTrend, mineDistribution,
}: {
  community: GearCommunity
  personal: GearPersonalStats
  modelName: string
  optedIn: boolean
  isPending: boolean
  onToggle: (next: boolean) => void
  kind: 'rifle' | 'pellet'
  mineTrend: RifleShowcaseData['score_trend']
  mineDistribution: RifleShowcaseData['score_distribution']
}) {
  return (
    <div className="space-y-4">
      <ComparisonOptInCard optedIn={optedIn} isPending={isPending} onToggle={onToggle} />

      {!optedIn && (
        <section className="bg-surface border border-subtle rounded-lg p-5 text-center space-y-2">
          <EyeOff size={20} className="mx-auto text-muted" aria-hidden="true" />
          <h2 className="t-subsection-title">Comparison is off for this item</h2>
          <p className="t-body-sm text-muted max-w-md mx-auto">
            Turn it back on above to see how your {modelName} results line up against every other shooter running the
            same model.
          </p>
        </section>
      )}

      {optedIn && !community.eligible && <NotEnoughDataCard community={community} modelName={modelName} />}

      {optedIn && community.eligible && (
        <>
          <section className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
            <div className="flex flex-col lg:flex-row gap-6 items-center">
              {community.your_percentile != null ? (
                <PercentileDial percentile={community.your_percentile} rank={community.your_rank} owners={community.owner_count} />
              ) : (
                <div className="text-center px-6 py-4 space-y-1.5">
                  <Info size={18} className="mx-auto text-muted" aria-hidden="true" />
                  <p className="t-body-sm text-muted max-w-[180px]">
                    Log a card with this {kind} to take your place in the ranking.
                  </p>
                </div>
              )}
              <div className="flex-1 w-full divide-y divide-[var(--border-subtle)]">
                <VersusRow label="Average score" you={personal.avg_score} them={community.avg_score} format={v => num(v, 1)} />
                <VersusRow label="Best score" you={personal.best_score} them={community.best_score} format={v => num(v, 0)} />
                <VersusRow label="Average X count" you={personal.avg_x_count} them={community.avg_x_count} format={v => num(v, 2)} />
                {(personal.best_group_mm != null || community.best_group_mm != null) && (
                  <VersusRow label="Best group" you={personal.best_group_mm} them={community.best_group_mm} format={mm} lowerIsBetter />
                )}
                {(personal.avg_group_mm != null || community.avg_group_mm != null) && (
                  <VersusRow label="Average group" you={personal.avg_group_mm} them={community.avg_group_mm} format={mm} lowerIsBetter />
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted tracking-wide mt-4 pt-3 border-t border-subtle">
              Pooled from {community.owner_count} opted-in owners · {community.card_count} cards
              {community.test_count > 0 && ` · ${community.test_count} tests`}
              {community.median_score != null && ` · median ${num(community.median_score, 1)}`}
              {community.p90_score != null && ` · 90th percentile ${num(community.p90_score, 1)}`}
            </p>
          </section>

          <ChartFrame
            title="You vs the community"
            hint="monthly average"
            isEmpty={mineTrend.length === 0 && community.trend.length === 0}
            emptyLabel="No dated results to plot yet."
          >
            <ScoreTrendChart mine={mineTrend} community={community.trend} personalBest={personal.best_score} />
          </ChartFrame>

          <ChartFrame
            title="Score distribution"
            hint="share of cards"
            isEmpty={mineDistribution.every(b => b.count === 0) && community.distribution.every(b => b.count === 0)}
          >
            <DistributionChart mine={mineDistribution} community={community.distribution} />
          </ChartFrame>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={kind === 'pellet' ? 'Tightest groups' : 'Top shooters'} icon={Trophy} hint="public profiles only">
              {kind === 'pellet'
                ? <GroupLeaderList leaders={community.group_leaders} />
                : <ScoreLeaderList leaders={community.leaders} />}
            </SectionCard>
            <SectionCard
              title={kind === 'pellet' ? 'Popular rifles for this pellet' : 'Popular pellets for this rifle'}
              icon={Layers}
            >
              <PairingList
                pairings={community.top_pairings}
                showUsers
                emptyLabel="No shared pairings recorded yet."
              />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Rifle showcase ──────────────────────────────────────────────────────────

export function RifleShowcase() {
  const { id } = useParams({ strict: false }) as { id: string }
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('performance')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['rifle-showcase', id],
    queryFn: () => gearApi.getRifleShowcase(id),
  })

  const optIn = useMutation({
    mutationFn: (next: boolean) => gearApi.updateRifle(id, { comparison_opt_in: next }),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: ['rifle-showcase', id] })
      qc.invalidateQueries({ queryKey: ['rifles'] })
      toast(next ? 'Rifle added to public comparison' : 'Rifle removed from public comparison', 'success')
    },
    onError: () => toast('Failed to update comparison setting', 'error'),
  })

  const imageSrc = useMemo(() => {
    if (!data) return UNKNOWN_BRAND_IMAGE
    return data.rifle.image_url ?? rifleImage({ make: data.rifle.make, model: data.rifle.model, calibre: data.rifle.calibre })
  }, [data])

  if (isLoading) return <ShowcaseSkeleton />
  if (isError || !data) return <ShowcaseError what="rifle" />

  const { rifle, personal, community } = data
  const modelName = `${rifle.make} ${rifle.model}`

  return (
    <ShowcaseShell
      imageSrc={imageSrc}
      title={modelName}
      subtitle="Rifle Showcase"
      personal={personal}
      tab={tab}
      setTab={setTab}
      chips={
        <>
          {rifle.calibre && <Chip><Crosshair size={11} aria-hidden="true" /> {rifle.calibre}</Chip>}
          {rifle.power_ftlb != null && <Chip><Target size={11} aria-hidden="true" /> {rifle.power_ftlb} ft·lb</Chip>}
          {personal.x_percentage != null && <Chip><Award size={11} aria-hidden="true" /> {num(personal.x_percentage, 1)}% X rate</Chip>}
          <Chip>{community.opted_in ? <Eye size={11} aria-hidden="true" /> : <EyeOff size={11} aria-hidden="true" />} {community.opted_in ? 'In comparison' : 'Private'}</Chip>
        </>
      }
    >
      {tab === 'performance' && (
        <div className="space-y-4">
          <ChartFrame title="Score over time" hint="monthly average ±σ" isEmpty={data.score_trend.length === 0}
            emptyLabel="Log a few cards with this rifle to see a trend.">
            <ScoreTrendChart mine={data.score_trend} personalBest={personal.best_score} />
          </ChartFrame>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame title="Score distribution" hint="share of cards" isEmpty={personal.card_count === 0}>
              <DistributionChart mine={data.score_distribution} />
            </ChartFrame>
            <ChartFrame title="Shot breakdown" hint="every shot fired" isEmpty={personal.shots_fired === 0}>
              <ShotBreakdownChart buckets={data.shot_breakdown} />
            </ChartFrame>
          </div>

          {data.group_trend.length > 0 && (
            <ChartFrame title="Group size over time" hint="lower is better">
              <GroupTrendChart points={data.group_trend} />
            </ChartFrame>
          )}

          <SectionCard title="Recent cards" icon={TrendingUp}>
            <RecentCardList cards={data.recent_cards} />
          </SectionCard>
        </div>
      )}

      {tab === 'comparison' && (
        <ComparisonTab
          kind="rifle"
          community={community}
          personal={personal}
          modelName={modelName}
          optedIn={rifle.comparison_opt_in}
          isPending={optIn.isPending}
          onToggle={next => optIn.mutate(next)}
          mineTrend={data.score_trend}
          mineDistribution={data.score_distribution}
        />
      )}

      {tab === 'pairings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Your pellets with this rifle" icon={Layers}>
            <PairingList pairings={data.pairings} emptyLabel="Log a card or test with a pellet to build pairings." />
          </SectionCard>
          <SectionCard title="What others shoot" icon={Users} hint={community.eligible ? undefined : 'needs more shooters'}>
            {community.opted_in && community.eligible
              ? <PairingList pairings={community.top_pairings} showUsers emptyLabel="No shared pairings recorded yet." />
              : <p className="text-sm text-muted">
                  {community.opted_in
                    ? 'Not enough opted-in owners of this model yet.'
                    : 'This rifle is out of public comparison, so community pairings are hidden.'}
                </p>}
          </SectionCard>
        </div>
      )}
    </ShowcaseShell>
  )
}

// ─── Pellet showcase ─────────────────────────────────────────────────────────

export function PelletShowcase() {
  const { id } = useParams({ strict: false }) as { id: string }
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('performance')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pellet-showcase', id],
    queryFn: () => gearApi.getPelletShowcase(id),
  })

  const optIn = useMutation({
    mutationFn: (next: boolean) => gearApi.updatePellet(id, { comparison_opt_in: next }),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: ['pellet-showcase', id] })
      qc.invalidateQueries({ queryKey: ['pellets'] })
      toast(next ? 'Pellet added to public comparison' : 'Pellet removed from public comparison', 'success')
    },
    onError: () => toast('Failed to update comparison setting', 'error'),
  })

  const imageSrc = useMemo(() => {
    if (!data) return UNKNOWN_BRAND_IMAGE
    return data.pellet.image_url ?? pelletImage({ brand: data.pellet.brand, model: data.pellet.model })
  }, [data])

  if (isLoading) return <ShowcaseSkeleton />
  if (isError || !data) return <ShowcaseError what="pellet" />

  const { pellet, personal, community } = data
  const modelName = `${pellet.brand} ${pellet.model}`

  return (
    <ShowcaseShell
      imageSrc={imageSrc}
      title={modelName}
      subtitle="Pellet Showcase"
      personal={personal}
      tab={tab}
      setTab={setTab}
      chips={
        <>
          {pellet.head_size_mm != null && <Chip><Crosshair size={11} aria-hidden="true" /> {pellet.head_size_mm} mm head</Chip>}
          {pellet.weight_grains != null && <Chip><Target size={11} aria-hidden="true" /> {pellet.weight_grains} gr</Chip>}
          {pellet.batch_code && <Chip>Batch {pellet.batch_code}</Chip>}
          <Chip>{community.opted_in ? <Eye size={11} aria-hidden="true" /> : <EyeOff size={11} aria-hidden="true" />} {community.opted_in ? 'In comparison' : 'Private'}</Chip>
        </>
      }
    >
      {tab === 'performance' && (
        <div className="space-y-4">
          <ChartFrame title="Group size over time" hint="lower is better" isEmpty={data.group_trend.length === 0}
            emptyLabel="Run a pellet test with this pellet to see group trends.">
            <GroupTrendChart points={data.group_trend} />
          </ChartFrame>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame title="Group distribution" hint="every measured group" isEmpty={data.group_distribution.every(b => b.count === 0)}>
              <DistributionChart mine={data.group_distribution} />
            </ChartFrame>
            <ChartFrame title="Score distribution" hint="share of cards" isEmpty={personal.card_count === 0}>
              <DistributionChart mine={data.score_distribution} />
            </ChartFrame>
          </div>

          {data.score_trend.length > 0 && (
            <ChartFrame title="Score over time" hint="monthly average ±σ">
              <ScoreTrendChart mine={data.score_trend} personalBest={personal.best_score} />
            </ChartFrame>
          )}

          <SectionCard title="Recent cards" icon={TrendingUp}>
            <RecentCardList cards={data.recent_cards} />
          </SectionCard>
        </div>
      )}

      {tab === 'comparison' && (
        <ComparisonTab
          kind="pellet"
          community={community}
          personal={personal}
          modelName={modelName}
          optedIn={pellet.comparison_opt_in}
          isPending={optIn.isPending}
          onToggle={next => optIn.mutate(next)}
          mineTrend={data.score_trend}
          mineDistribution={data.score_distribution}
        />
      )}

      {tab === 'pairings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Your rifles with this pellet" icon={Layers}>
            <PairingList pairings={data.pairings} emptyLabel="Log a card or test with a rifle to build pairings." />
          </SectionCard>
          <SectionCard title="What others shoot it in" icon={Users} hint={community.eligible ? undefined : 'needs more shooters'}>
            {community.opted_in && community.eligible
              ? <PairingList pairings={community.top_pairings} showUsers emptyLabel="No shared pairings recorded yet." />
              : <p className="text-sm text-muted">
                  {community.opted_in
                    ? 'Not enough opted-in owners of this model yet.'
                    : 'This pellet is out of public comparison, so community pairings are hidden.'}
                </p>}
          </SectionCard>
        </div>
      )}
    </ShowcaseShell>
  )
}
