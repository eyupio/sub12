import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { GearGroupPoint, GearHistogramBin, GearShotBucket, GearTrendPoint } from '../api/gear'

// Two-series categorical palette for every gear chart: the viewer's own data
// against the community's. Both hues clear the lightness, chroma, CVD-separation
// and contrast checks on the light (#ffffff) and dark (#202024) chart surfaces,
// so one pair serves both themes. A third hue is deliberately absent — a green
// alongside the brass collapses to ΔE 1.6 under protanopia, so "best" is drawn
// as a neutral reference line rather than a third series.
export const SERIES_YOU = '#b98a33'
export const SERIES_COMMUNITY = '#2f7cc0'

const AXIS_TICK = { fontSize: 10, fill: 'var(--color-text-muted, #888)' }
const GRID_STROKE = 'var(--color-border-subtle, #333)'
const TOOLTIP_STYLE = {
  background: 'var(--color-bg-surface, #1a1a1a)',
  border: '1px solid var(--color-border-subtle, #333)',
  borderRadius: 6,
  fontSize: 11,
}
const TOOLTIP_LABEL = { color: 'var(--color-text-muted, #888)' }
const LEGEND_STYLE = { fontSize: 10, paddingTop: 4 }

/** Trims a YYYY-MM-DD bucket down to YYYY-MM for the month axis. */
const monthTick = (v: string) => v.slice(0, 7)

export function ChartFrame({
  title, hint, isEmpty, emptyLabel, children,
}: {
  title: string
  hint?: string
  isEmpty?: boolean
  emptyLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-section-title">{title}</h2>
        {hint && <p className="text-[10px] text-muted tracking-wide">{hint}</p>}
      </div>
      {isEmpty ? (
        <div className="h-56 flex items-center justify-center text-sm text-muted">
          {emptyLabel ?? 'Not enough data yet.'}
        </div>
      ) : (
        <div className="h-56 lg:h-64 w-full">{children}</div>
      )}
    </section>
  )
}

/**
 * Score over time. Draws the viewer's monthly average with a ±σ band, and
 * overlays the community average for the same model when supplied.
 */
export function ScoreTrendChart({
  mine, community, personalBest,
}: {
  mine: GearTrendPoint[]
  community?: GearTrendPoint[]
  personalBest?: number
}) {
  const byPeriod = new Map<string, { period: string; you?: number; upper?: number; lower?: number; them?: number; cards?: number }>()
  for (const p of mine) {
    byPeriod.set(p.period, {
      period: p.period,
      you: p.avg_score,
      upper: Number((p.avg_score + p.std_dev).toFixed(2)),
      lower: Number(Math.max(0, p.avg_score - p.std_dev).toFixed(2)),
      cards: p.card_count,
    })
  }
  for (const p of community ?? []) {
    const row = byPeriod.get(p.period) ?? { period: p.period }
    row.them = p.avg_score
    byPeriod.set(p.period, row)
  }
  const data = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
  const hasCommunity = (community?.length ?? 0) > 0

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} />
        <XAxis dataKey="period" tick={AXIS_TICK} tickFormatter={monthTick} />
        <YAxis domain={['auto', 'auto']} tick={AXIS_TICK} width={38} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL}
          formatter={(value, name) => {
            if (value == null || name === 'upper' || name === 'lower') return null
            const n = typeof value === 'number' ? value : Number(value)
            if (name === 'you') return [n.toFixed(1), 'You']
            if (name === 'them') return [n.toFixed(1), 'Community avg']
            return [n, String(name)]
          }}
        />
        {hasCommunity && (
          <Legend
            wrapperStyle={LEGEND_STYLE}
            formatter={(value) => (
              <span style={{ color: 'var(--color-text-muted, #888)' }}>
                {value === 'you' ? 'You' : 'Community avg'}
              </span>
            )}
          />
        )}
        {/* ±σ band around the viewer's own average. */}
        <Area type="monotone" dataKey="upper" stroke="transparent" fill={SERIES_YOU} fillOpacity={0.1} legendType="none" />
        <Area type="monotone" dataKey="lower" stroke="transparent" fill="var(--color-bg-surface, #1a1a1a)" fillOpacity={1} legendType="none" />
        {personalBest != null && (
          <ReferenceLine
            y={personalBest}
            stroke="var(--color-text-muted, #888)"
            strokeDasharray="4 3"
            strokeOpacity={0.55}
            label={{ value: `PB ${personalBest}`, position: 'insideTopRight', style: { fontSize: 9, fill: 'var(--color-text-muted, #888)' } }}
          />
        )}
        {hasCommunity && (
          <Line type="monotone" dataKey="them" name="them" stroke={SERIES_COMMUNITY} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
        )}
        <Line type="monotone" dataKey="you" name="you" stroke={SERIES_YOU} strokeWidth={2} dot={{ r: 3, fill: SERIES_YOU }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Score distribution. When a community distribution is supplied both series are
 * normalised to a share of their own total, so a handful of personal cards can
 * still be read against thousands of community ones.
 */
export function DistributionChart({
  mine, community,
}: {
  mine: GearHistogramBin[]
  community?: GearHistogramBin[]
}) {
  const mineTotal = mine.reduce((s, b) => s + b.count, 0)
  const themTotal = (community ?? []).reduce((s, b) => s + b.count, 0)
  const hasCommunity = themTotal > 0

  const data = mine.map((b, i) => ({
    label: b.label,
    you: mineTotal > 0 ? Number(((b.count / mineTotal) * 100).toFixed(1)) : 0,
    them: hasCommunity ? Number((((community?.[i]?.count ?? 0) / themTotal) * 100).toFixed(1)) : 0,
    youCount: b.count,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
        <YAxis tick={AXIS_TICK} width={38} unit="%" />
        <Tooltip
          cursor={{ fill: 'var(--color-border-subtle, #333)', fillOpacity: 0.25 }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL}
          formatter={(value, name, entry) => {
            const n = typeof value === 'number' ? value : Number(value)
            if (name === 'you') {
              const count = (entry?.payload as { youCount?: number } | undefined)?.youCount
              return [`${n}%${count != null ? ` (${count} card${count === 1 ? '' : 's'})` : ''}`, 'You']
            }
            return [`${n}%`, 'Community']
          }}
        />
        {hasCommunity && (
          <Legend
            wrapperStyle={LEGEND_STYLE}
            formatter={(value) => (
              <span style={{ color: 'var(--color-text-muted, #888)' }}>
                {value === 'you' ? 'You' : 'Community'}
              </span>
            )}
          />
        )}
        <Bar dataKey="you" name="you" fill={SERIES_YOU} radius={[4, 4, 0, 0]} maxBarSize={40} />
        {hasCommunity && (
          <Bar dataKey="them" name="them" fill={SERIES_COMMUNITY} radius={[4, 4, 0, 0]} maxBarSize={40} />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** How often each shot value 0-10 was scored with this gear. Single series. */
export function ShotBreakdownChart({ buckets }: { buckets: GearShotBucket[] }) {
  const data = buckets.map(b => ({ label: String(b.value), count: b.count }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
        <YAxis tick={AXIS_TICK} width={38} />
        <Tooltip
          cursor={{ fill: 'var(--color-border-subtle, #333)', fillOpacity: 0.25 }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL}
          formatter={(value) => [value as number, 'Shots']}
          labelFormatter={(label) => `Scored ${label}`}
        />
        <Bar dataKey="count" fill={SERIES_YOU} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Group size over time. Smaller is better, so the axis is reversed to keep
 * "up means improving" true — the same reading as every other chart here.
 */
export function GroupTrendChart({ points }: { points: GearGroupPoint[] }) {
  const data = points.map(p => ({
    period: p.period,
    avg: p.avg_group_mm,
    best: p.best_group_mm,
    tests: p.test_count,
  }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} />
        <XAxis dataKey="period" tick={AXIS_TICK} tickFormatter={monthTick} />
        <YAxis reversed domain={['auto', 'auto']} tick={AXIS_TICK} width={38} unit="mm" />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL}
          formatter={(value, name) => {
            if (value == null) return null
            const n = typeof value === 'number' ? value : Number(value)
            return [`${n.toFixed(2)} mm`, name === 'avg' ? 'Average group' : 'Best group']
          }}
        />
        <Legend
          wrapperStyle={LEGEND_STYLE}
          formatter={(value) => (
            <span style={{ color: 'var(--color-text-muted, #888)' }}>
              {value === 'avg' ? 'Average group' : 'Best group'}
            </span>
          )}
        />
        <Line type="monotone" dataKey="best" name="best" stroke={SERIES_COMMUNITY} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
        <Line type="monotone" dataKey="avg" name="avg" stroke={SERIES_YOU} strokeWidth={2} dot={{ r: 3, fill: SERIES_YOU }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
