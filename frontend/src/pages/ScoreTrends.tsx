import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, ComposedChart,
} from 'recharts'
import { ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { statsApi } from '../api/stats'
import { gearApi } from '../api/gear'

export default function ScoreTrends() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [rifleId, setRifleId] = useState<string>('')

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
    date: p.period.slice(0, 7) === p.period.slice(0, 7) ? p.period : p.period,
    avg: p.avg_score,
    best: p.best_score,
    upper: parseFloat((p.avg_score + p.std_dev).toFixed(2)),
    lower: parseFloat(Math.max(0, p.avg_score - p.std_dev).toFixed(2)),
    cards: p.card_count,
    std_dev: p.std_dev,
  }))

  const first = points[0]?.avg_score
  const last = points[points.length - 1]?.avg_score
  const trendDelta = first != null && last != null ? last - first : null
  const avgConsistency = points.length > 0
    ? (points.reduce((s, p) => s + p.std_dev, 0) / points.length).toFixed(2)
    : null

  const mostConsistent = points.length > 0
    ? points.reduce((a, b) => a.std_dev < b.std_dev ? a : b)
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
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
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
                  ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
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
        <div className="grid grid-cols-3 gap-3">
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
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Average Score</h2>

        {isLoading && (
          <div className="h-64 animate-pulse bg-card rounded" />
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
                  formatter={(value, name: string) => {
                    if (name === 'upper' || name === 'lower') return null
                    const v = value as number
                    if (name === 'avg') return [v.toFixed(1), 'Avg Score']
                    if (name === 'best') return [v, 'Best Score']
                    return [v, name]
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

      {/* Data table */}
      {points.length > 0 && (
        <div className="bg-surface border border-subtle rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-subtle">
                <th className="px-4 py-2.5 text-left text-[10px] tracking-widest uppercase text-muted font-normal">Period</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Avg</th>
                <th className="px-4 py-2.5 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Best</th>
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
