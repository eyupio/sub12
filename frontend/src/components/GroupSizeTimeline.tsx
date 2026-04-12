import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { pelletTestApi, type GroupTimelinePoint } from '../api/pelletTesting'

interface Props {
  rifleId: string
}

const COLORS = ['#c9a84c', '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#eab308']

export default function GroupSizeTimeline({ rifleId }: Props) {
  const [unit, setUnit] = useState<'mm' | 'moa'>('mm')

  const { data, isLoading } = useQuery({
    queryKey: ['pellet-timeline', rifleId],
    queryFn: () => pelletTestApi.timeline(rifleId),
    enabled: !!rifleId,
  })

  const points = data?.items ?? []

  if (isLoading) {
    return <div className="h-64 rounded bg-surface animate-pulse" />
  }

  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted border border-subtle rounded bg-surface">
        No timeline data yet — complete some pellet tests first.
      </div>
    )
  }

  const pelletLabel = (point: GroupTimelinePoint) =>
    point.pellet_name ?? `${point.pellet_brand} ${point.pellet_model}`

  // Group by pellet name to build separate series
  const pelletNames = [...new Set(points.map((p: GroupTimelinePoint) => pelletLabel(p)))]

  // Build chart data: each date point has a value per pellet
  const dateMap = new Map<string, Record<string, number>>()
  for (const p of points) {
    const key = p.test_date
    if (!dateMap.has(key)) dateMap.set(key, {})
    const entry = dateMap.get(key)!
    const value = unit === 'moa' ? p.group_size_moa : p.group_size_mm
    if (value == null) continue
    const pelletName = pelletLabel(p)
    // For same date + pellet, take the best (smallest) group
    const existing = entry[pelletName]
    if (existing == null || value < existing) {
      entry[pelletName] = Number(value.toFixed(3))
    }
  }

  const chartData = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] tracking-widest uppercase text-muted">Group Size Over Time</h3>
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
              tickFormatter={(v: string) => v.slice(5)} // show MM-DD
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
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            />
            {pelletNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
