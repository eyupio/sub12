import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, ComposedChart,
} from 'recharts'
import { ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { statsApi } from '../api/stats'
import { gearApi } from '../api/gear'

export default function ScoreTrends() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { period?: 'week' | 'month'; rifleId?: string }
  const period: 'week' | 'month' = search.period === 'month' ? 'month' : 'week'
  const rifleId = search.rifleId ?? ''

  const setPeriod = (next: 'week' | 'month') => {
    navigate({
      to: '/scores/trends',
      search: { period: next, rifleId: rifleId || undefined },
      replace: true,
    })
  }
  const setRifleId = (next: string) => {
    navigate({
      to: '/scores/trends',
      search: { period, rifleId: next || undefined },
      replace: true,
    })
  }

  const { data: trendsData, isLoading } = useQuery({
    queryKey: ['score-trends', period, rifleId || null],
    queryFn: () => statsApi.getScoreTrends(period, rifleId || undefined),
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })

  const points = trendsData?.items ?? []

  const chartData = points.map(p => ({
    date: p.period,
    avg: p.avg_score,
    best: p.best_score,
    upper: parseFloat((p.avg_score + p.std_dev).toFixed(2)),
    lower: parseFloat(Math.max(0, p.avg_score - p.std_dev).toFixed(2)),
    cards: p.card_count,
    std_dev: p.std_dev,
    avgX: p.avg_x_count,
    bestX: p.best_x_count,
  }))

  const first = points[0]?.avg_score
  const last = points[points.length - 1]?.avg_score
  const trendDelta = first != null && last != null && points.length >= 2
    ? last - first
    : null
  const avgConsistency = points.length > 0
    ? (points.reduce((s, p) => s + p.std_dev, 0) / points.length).toFixed(2)
    : null

  const mostConsistent = points.length > 0
    ? points.reduce((a, b) => a.std_dev < b.std_dev ? a : b)
    : null

  const firstX = points[0]?.avg_x_count
  const lastX = points[points.length - 1]?.avg_x_count
  const xTrendDelta = firstX != null && lastX != null && points.length >= 2
    ? lastX - firstX
    : null

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/scores"
          className="text-muted hover:text-secondary transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="t-page-title">
          Score Trends
        </h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded border text-[10px] tracking-widest uppercase transition-colors ${
                period === p
                  ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              {p === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>

        {riflesData && riflesData.items.length > 0 && (
          <select
            value={rifleId}
            onChange={e => setRifleId(e.target.value)}
            className="bg-surface border border-subtle rounded px-2.5 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
          >
            <option value="">All Rifles</option>
            {riflesData.items.map(r => (
              <option key={r.id} value={r.id}>{r.make} {r.model}</option>
            ))}
          </select>
        )}
      </div>

      {/* Summary cards */}
      {points.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface border border-subtle rounded p-3 space-y-1">
            <p className="text-[10px] tracking-widest uppercase text-muted">Trend</p>
            {trendDelta != null ? (
              <div className="flex items-center gap-1.5">
                {trendDelta > 0
                  ? <TrendingUp size={16} className="text-[var(--success-text)]" />
                  : trendDelta < 0
                  ? <TrendingDown size={16} className="text-[var(--error-text)]" />
                  : <Minus size={16} className="text-muted" />
                }
                <span className={`font-mono text-sm ${
                  trendDelta > 0 ? 'text-[var(--success-text)]' : trendDelta < 0 ? 'text-[var(--error-text)]' : 'text-muted'
                }`}>
                  {trendDelta > 0 ? '+' : ''}{trendDelta.toFixed(1)}
                </span>
              </div>
            ) : <span className="text-muted font-mono text-sm">—</span>}
          </div>

          <div className="bg-surface border border-subtle rounded p-3 space-y-1">
            <p className="text-[10px] tracking-widest uppercase text-muted">X-Count Trend</p>
            {xTrendDelta != null ? (
              <div className="flex items-center gap-1.5">
                {xTrendDelta > 0
                  ? <TrendingUp size={16} className="text-[var(--success-text)]" />
                  : xTrendDelta < 0
                  ? <TrendingDown size={16} className="text-[var(--error-text)]" />
                  : <Minus size={16} className="text-muted" />
                }
                <span className={`font-mono text-sm ${
                  xTrendDelta > 0 ? 'text-[var(--success-text)]' : xTrendDelta < 0 ? 'text-[var(--error-text)]' : 'text-muted'
                }`}>
                  {xTrendDelta > 0 ? '+' : ''}{xTrendDelta.toFixed(1)}
                </span>
              </div>
            ) : <span className="text-muted font-mono text-sm">—</span>}
          </div>

          <div className="bg-surface border border-subtle rounded p-3 space-y-1">
            <p className="text-[10px] tracking-widest uppercase text-muted">Avg σ</p>
            <p className="font-mono text-sm text-secondary">{avgConsistency ?? '—'}</p>
          </div>

          <div className="bg-surface border border-subtle rounded p-3 space-y-1">
            <p className="text-[10px] tracking-widest uppercase text-muted">Best Period</p>
            <p className="font-mono text-sm text-secondary">
              {mostConsistent ? mostConsistent.period.slice(5) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-surface border border-subtle rounded p-4 space-y-3">
        <h2 className="t-section-title">Average Score</h2>

        {isLoading && (
          <div className="h-64 skeleton rounded" />
        )}

        {!isLoading && points.length === 0 && (
          <div className="h-64 flex items-center justify-center text-sm text-muted">
            No score cards logged yet for this filter.
          </div>
        )}

        {!isLoading && points.length > 0 && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle, #333)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
                  tickFormatter={(v: string) => period === 'week' ? v.slice(5) : v.slice(0, 7)}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
                  label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--color-text-muted, #888)' } }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-bg-surface, #1a1a1a)', border: '1px solid var(--color-border-subtle, #333)', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: 'var(--color-text-muted, #888)' }}
                  formatter={(value, name) => {
                    if (name == null || name === 'upper' || name === 'lower' || value == null) {
                      return null
                    }

                    const numericValue = typeof value === 'number' ? value : Number(value)

                    if (name === 'avg') return [numericValue.toFixed(1), 'Avg Score']
                    if (name === 'best') return [numericValue, 'Best Score']
                    return [numericValue, String(name)]
                  }}
                />
                {/* ±σ band */}
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="transparent"
                  fill="var(--brass, #c9a84c)"
                  fillOpacity={0.08}
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="transparent"
                  fill="var(--color-bg-surface, #1a1a1a)"
                  fillOpacity={1}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#c9a84c"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#c9a84c' }}
                  name="avg"
                />
                <Line
                  type="monotone"
                  dataKey="best"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name="best"
                />
                {points.length > 1 && trendDelta != null && (
                  <ReferenceLine
                    y={first}
                    stroke="var(--color-text-muted, #888)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {points.length > 0 && (
          <p className="text-[10px] text-muted">
            Shaded band = ±1σ (consistency range) · Dashed green = best score per period
          </p>
        )}
      </div>

      {/* X-Count chart */}
      {!isLoading && points.length > 0 && (
        <div className="bg-surface border border-subtle rounded p-4 space-y-3">
          <h2 className="t-section-title">X-Count per Period</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle, #333)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
                  tickFormatter={(v: string) => period === 'week' ? v.slice(5) : v.slice(0, 7)}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
                  label={{ value: 'X count', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--color-text-muted, #888)' } }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-bg-surface, #1a1a1a)', border: '1px solid var(--color-border-subtle, #333)', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: 'var(--color-text-muted, #888)' }}
                  formatter={(value, name) => {
                    if (value == null) return null
                    const numericValue = typeof value === 'number' ? value : Number(value)
                    if (name === 'avgX') return [numericValue.toFixed(1), 'Avg X-Count']
                    if (name === 'bestX') return [numericValue, 'Best X-Count']
                    return [numericValue, String(name)]
                  }}
                />
                <Bar
                  dataKey="avgX"
                  fill="#c9a84c"
                  fillOpacity={0.7}
                  radius={[3, 3, 0, 0]}
                  name="avgX"
                />
                <Line
                  type="monotone"
                  dataKey="bestX"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name="bestX"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted">
            Bar = average X-count per period · Dashed green = best X-count per period
          </p>
        </div>
      )}

      {/* Data table */}
      {points.length > 0 && (
        <div className="bg-surface border border-subtle rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-subtle">
                <th className="px-4 py-2.5 text-left text-[10px] tracking-widest uppercase text-muted font-normal">Period</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Avg</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Best</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Avg X</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">σ</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Cards</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {[...points].reverse().map(p => (
                <tr key={p.period} className="hover:bg-card/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted">{p.period}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-secondary">{p.avg_score.toFixed(1)}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-secondary">{p.best_score ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-[var(--brass)]">{p.avg_x_count.toFixed(1)}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-muted">{p.std_dev.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-muted">{p.card_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
