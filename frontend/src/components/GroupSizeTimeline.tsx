import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { pelletTestApi, type GroupTimelinePoint } from '../api/pelletTesting'
import { formatDateShort, useRegionalPrefs } from '../utils/date'

const COLORS = ['#c9a84c', '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#eab308']

export default function GroupSizeTimeline() {
  const [unit, setUnit] = useState<'mm' | 'moa'>('mm')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const prefs = useRegionalPrefs()

  const { data, isLoading } = useQuery({
    queryKey: ['pellet-timeline'],
    queryFn: () => pelletTestApi.timeline(),
  })

  const points = data?.items ?? []

  if (isLoading) {
    return <div className="h-64 rounded skeleton" />
  }

  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted border border-subtle rounded bg-surface">
        No timeline data yet — complete some pellet tests first.
      </div>
    )
  }

  const seriesKey = (point: GroupTimelinePoint) => {
    const pellet = point.pellet_name ?? `${point.pellet_brand} ${point.pellet_model}`
    return `${point.rifle_make} ${point.rifle_model} — ${pellet}`
  }

  const seriesNames = [...new Set(points.map(seriesKey))]

  const dateMap = new Map<string, Record<string, number>>()
  for (const p of points) {
    const key = p.test_date
    if (!dateMap.has(key)) dateMap.set(key, {})
    const entry = dateMap.get(key)!
    const value = unit === 'moa' ? p.group_size_moa : p.group_size_mm
    if (value == null) continue
    const name = seriesKey(p)
    const existing = entry[name]
    if (existing == null || value < existing) {
      entry[name] = Number(value.toFixed(3))
    }
  }

  const chartData = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }))

  const toggleSeries = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="t-section-title">Group Size Over Time</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setUnit('mm')}
            className={`px-2 py-0.5 rounded text-[10px] tracking-widest uppercase transition-colors ${unit === 'mm' ? 'bg-[var(--brass)]/20 text-[var(--brass)] border border-[var(--brass)]/30' : 'text-muted border border-subtle hover:text-secondary'}`}
          >
            mm
          </button>
          <button
            onClick={() => setUnit('moa')}
            className={`px-2 py-0.5 rounded text-[10px] tracking-widest uppercase transition-colors ${unit === 'moa' ? 'bg-[var(--brass)]/20 text-[var(--brass)] border border-[var(--brass)]/30' : 'text-muted border border-subtle hover:text-secondary'}`}
          >
            MOA
          </button>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle, #333)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
              tickFormatter={(v: string) => formatDateShort(v, prefs)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }}
              domain={['auto', 'auto']}
              label={{ value: unit, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--color-text-muted, #888)' } }}
            />
            <Tooltip
              contentStyle={{ background: 'var(--color-bg-surface, #1a1a1a)', border: '1px solid var(--color-border-subtle, #333)', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: 'var(--color-text-muted, #888)' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8, cursor: 'pointer' }}
              onClick={(entry) => {
                const key = typeof entry?.dataKey === 'string' ? entry.dataKey : entry?.value
                if (typeof key === 'string') toggleSeries(key)
              }}
              formatter={(value: string) => (
                <span style={{ opacity: hidden.has(value) ? 0.4 : 1, textDecoration: hidden.has(value) ? 'line-through' : 'none' }}>
                  {value}
                </span>
              )}
            />
            {seriesNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                hide={hidden.has(name)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
