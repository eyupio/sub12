import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Crosshair } from 'lucide-react'
import { pelletTestApi, PelletLeaderboardEntry } from '../api/pelletTesting'
import { gearApi, Rifle } from '../api/gear'

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm focus:outline-none focus:border-[var(--brass)]/50'

export default function PelletTestLeaderboard() {
  const [selectedRifleId, setSelectedRifleId] = useState('')

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })
  const rifles = useMemo(
    () => riflesData?.items?.filter((r: Rifle) => r.is_active) ?? [],
    [riflesData],
  )

  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ['pellet-test-leaderboard', selectedRifleId],
    queryFn: () => pelletTestApi.leaderboard(selectedRifleId),
    enabled: !!selectedRifleId,
  })
  const entries = leaderboardData?.items ?? []

  // Auto-select first rifle if only one
  useEffect(() => {
    if (!selectedRifleId && rifles.length === 1) {
      setSelectedRifleId(rifles[0].id)
    }
  }, [rifles, selectedRifleId])

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">

      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
        Pellet Leaderboard
      </h1>

      {/* Rifle selector */}
      <div className="max-w-xs">
        <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Rifle</label>
        {rifles.length > 0 ? (
          <select
            value={selectedRifleId}
            onChange={e => setSelectedRifleId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select rifle…</option>
            {rifles.map((r: Rifle) => (
              <option key={r.id} value={r.id}>{r.make} {r.model} ({r.calibre})</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted">
            <a href="/gear" className="text-[var(--brass)] hover:opacity-80">Add a rifle</a> to see leaderboards
          </p>
        )}
      </div>

      {/* Leaderboard table */}
      {!selectedRifleId ? (
        <div className="text-center py-12">
          <Crosshair size={32} className="mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">Select a rifle to view pellet rankings</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded bg-surface animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <Trophy size={32} className="mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">No pellet test data for this rifle yet</p>
          <p className="text-[11px] text-muted mt-1">Log tests to build your leaderboard</p>
        </div>
      ) : (
        <div>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-widest uppercase text-muted border-b border-subtle">
                  <th className="text-left py-2 px-2 w-10">#</th>
                  <th className="text-left py-2 px-2">Pellet</th>
                  <th className="text-right py-2 px-2">Best</th>
                  <th className="text-right py-2 px-2">Avg</th>
                  <th className="text-right py-2 px-2">Tests</th>
                  <th className="text-right py-2 px-2">Groups</th>
                  <th className="text-right py-2 px-2">Consistency</th>
                  <th className="text-right py-2 px-2">Last Tested</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: PelletLeaderboardEntry) => (
                  <tr
                    key={e.pellet_id}
                    className={`border-b border-subtle ${e.rank === 1 ? 'text-[var(--brass)]' : 'text-secondary'}`}
                  >
                    <td className="py-3 px-2 font-mono font-semibold">
                      {e.rank === 1 ? <Trophy size={14} className="inline" /> : e.rank}
                    </td>
                    <td className="py-3 px-2">
                      <p className="font-medium">{e.pellet_brand} {e.pellet_model}</p>
                      <p className="text-[11px] text-muted">
                        {[
                          e.head_size_mm != null && `${e.head_size_mm}mm`,
                          e.weight_grains != null && `${e.weight_grains}gr`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="py-3 px-2 text-right font-mono">{e.best_group_mm.toFixed(2)}mm</td>
                    <td className="py-3 px-2 text-right font-mono">{e.avg_group_mm.toFixed(2)}mm</td>
                    <td className="py-3 px-2 text-right font-mono">{e.test_count}</td>
                    <td className="py-3 px-2 text-right font-mono">{e.total_groups}</td>
                    <td className="py-3 px-2 text-right font-mono text-muted">
                      {e.consistency_score != null ? `±${e.consistency_score.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-2 text-right text-muted">{e.last_tested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {entries.map((e: PelletLeaderboardEntry) => (
              <div
                key={e.pellet_id}
                className={`p-3 rounded border bg-surface ${
                  e.rank === 1
                    ? 'border-[var(--brass)]/40'
                    : 'border-subtle'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center font-mono font-semibold text-sm shrink-0 ${
                    e.rank === 1 ? 'bg-[var(--brass)]/15 text-[var(--brass)]' : 'bg-surface-hover text-muted'
                  }`}>
                    {e.rank === 1 ? <Trophy size={14} /> : e.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${e.rank === 1 ? 'text-[var(--brass)]' : 'text-secondary'}`}>
                      {e.pellet_brand} {e.pellet_model}
                    </p>
                    <p className="text-[11px] text-muted">
                      {e.test_count} test{e.test_count !== 1 ? 's' : ''} · {e.total_groups} group{e.total_groups !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <p className={`text-sm font-semibold ${e.rank === 1 ? 'text-[var(--brass)]' : 'text-secondary'}`}>
                      {e.best_group_mm.toFixed(2)}<span className="text-xs">mm</span>
                    </p>
                    <p className="text-[10px] text-muted">avg {e.avg_group_mm.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
