import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react'
import { pelletTestApi, type ComboPerformanceSummary } from '../api/pelletTesting'
import { gearApi } from '../api/gear'

type SortKey = 'best_group_mm' | 'avg_group_mm' | 'test_count' | 'consistency'

function consistencyClass(value?: number) {
  if (value == null) return 'text-muted'
  if (value <= 1.0) return 'text-[var(--success-text)]'
  if (value <= 2.0) return 'text-amber-400'
  return 'text-[var(--error-text)]'
}

function SortButton({ col, sortKey, dir, onClick }: {
  col: SortKey
  sortKey: SortKey
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  const active = sortKey === col
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0.5 text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
    >
      {col === 'best_group_mm' ? 'Best' :
       col === 'avg_group_mm' ? 'Avg' :
       col === 'test_count' ? 'Tests' : 'σ'}
      {active
        ? dir === 'asc'
          ? <ChevronUp size={10} className="text-[var(--brass)]" />
          : <ChevronDown size={10} className="text-[var(--brass)]" />
        : <ChevronUp size={10} className="opacity-20" />
      }
    </button>
  )
}

export default function ComboAnalytics() {
  const [rifleId, setRifleId] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('best_group_mm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { data: combosData, isLoading } = useQuery({
    queryKey: ['combo-analytics', rifleId || null],
    queryFn: () => pelletTestApi.comboAnalytics(rifleId || undefined),
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles'],
    queryFn: () => gearApi.listRifles(),
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'test_count' ? 'desc' : 'asc')
    }
  }

  const sorted = [...(combosData?.items ?? [])].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
    const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/pellet-testing"
          className="text-muted hover:text-secondary transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="t-page-title">
          Combo Analytics
        </h1>
      </div>

      <p className="text-sm text-muted">
        Cross-session performance for every rifle + pellet combination you've tested.
      </p>

      {/* Rifle filter */}
      {riflesData && riflesData.items.length > 1 && (
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

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded border border-subtle skeleton" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sorted.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted text-sm tracking-widest uppercase">No test data yet</p>
          <Link
            to="/pellet-testing/new"
            className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            Log a pellet test →
          </Link>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="bg-surface border border-subtle rounded overflow-hidden">
          {/* Mobile: card layout */}
          <div className="lg:hidden divide-y divide-subtle">
            {sorted.map((combo, i) => (
              <ComboCard key={`${combo.rifle_id}-${combo.pellet_id}`} combo={combo} rank={i + 1} />
            ))}
          </div>

          {/* Desktop: table layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle">
                  <th className="px-4 py-3 text-left text-[10px] tracking-widest uppercase text-muted font-normal">#</th>
                  <th className="px-4 py-3 text-left text-[10px] tracking-widest uppercase text-muted font-normal">Rifle</th>
                  <th className="px-4 py-3 text-left text-[10px] tracking-widest uppercase text-muted font-normal">Pellet</th>
                  <th className="px-4 py-3 text-right">
                    <SortButton col="best_group_mm" sortKey={sortKey} dir={sortDir} onClick={() => toggleSort('best_group_mm')} />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortButton col="avg_group_mm" sortKey={sortKey} dir={sortDir} onClick={() => toggleSort('avg_group_mm')} />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortButton col="test_count" sortKey={sortKey} dir={sortDir} onClick={() => toggleSort('test_count')} />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortButton col="consistency" sortKey={sortKey} dir={sortDir} onClick={() => toggleSort('consistency')} />
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] tracking-widest uppercase text-muted font-normal">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {sorted.map((combo, i) => (
                  <tr key={`${combo.rifle_id}-${combo.pellet_id}`} className="hover:bg-card/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-secondary max-w-[140px] truncate">{combo.rifle_name}</td>
                    <td className="px-4 py-3 text-secondary max-w-[140px] truncate">{combo.pellet_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-right text-secondary">
                      {combo.best_group_mm != null ? `${combo.best_group_mm.toFixed(2)}mm` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-right text-muted">
                      {combo.avg_group_mm != null ? `${combo.avg_group_mm.toFixed(2)}mm` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-right text-muted">{combo.test_count}</td>
                    <td className={`px-4 py-3 font-mono text-xs text-right ${consistencyClass(combo.consistency)}`}>
                      {combo.consistency != null ? `±${combo.consistency.toFixed(2)}mm` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-right text-muted">
                      {combo.last_tested.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <p className="text-[10px] text-muted">
          σ = consistency (std dev of avg group size across sessions) · green ≤1mm · amber ≤2mm · red &gt;2mm
        </p>
      )}
    </div>
  )
}

function ComboCard({ combo, rank }: { combo: ComboPerformanceSummary; rank: number }) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[10px] tracking-widest uppercase text-muted">#{rank}</p>
          <p className="text-sm text-secondary font-medium truncate">{combo.rifle_name}</p>
          <p className="text-xs text-muted truncate">{combo.pellet_name}</p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <p className="font-mono text-sm text-secondary">
            {combo.best_group_mm != null ? `${combo.best_group_mm.toFixed(2)}mm` : '—'}
          </p>
          <p className="text-[10px] text-muted">best</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted">avg <span className="font-mono text-secondary">{combo.avg_group_mm?.toFixed(2) ?? '—'}mm</span></span>
        <span className="text-muted">tests <span className="font-mono text-secondary">{combo.test_count}</span></span>
        <span className="text-muted">σ <span className={`font-mono ${consistencyClass(combo.consistency)}`}>
          {combo.consistency != null ? `±${combo.consistency.toFixed(2)}mm` : '—'}
        </span></span>
      </div>
    </div>
  )
}
