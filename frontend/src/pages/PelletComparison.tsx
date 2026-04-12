import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, Trophy, ArrowLeftRight, TrendingDown } from 'lucide-react'
import { pelletTestApi, type PelletComparisonData } from '../api/pelletTesting'
import { gearApi } from '../api/gear'

const selectCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2 text-primary text-sm placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50'

function Stat({ label, value, unit, highlight }: { label: string; value: string | number | null | undefined; unit?: string; highlight?: boolean }) {
  if (value == null) return null
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-sm font-mono font-medium ${highlight ? 'text-[var(--brass)]' : 'text-secondary'}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}
        {unit && <span className="text-xs text-muted ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

export default function PelletComparison() {
  const [rifleId, setRifleId] = useState('')
  const [pelletA, setPelletA] = useState('')
  const [pelletB, setPelletB] = useState('')

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles() })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets() })
  const rifles = rifleData?.items ?? []
  const pellets = pelletData?.items ?? []

  const canCompare = rifleId && pelletA && pelletB && pelletA !== pelletB

  const { data: comparison, isLoading, isError } = useQuery<PelletComparisonData>({
    queryKey: ['pellet-comparison', rifleId, pelletA, pelletB],
    queryFn: () => pelletTestApi.compare(rifleId, pelletA, pelletB),
    enabled: !!canCompare,
  })

  function isBetter(a: number | null | undefined, b: number | null | undefined, lower: boolean): 'a' | 'b' | 'tie' {
    if (a == null || b == null) return 'tie'
    if (a === b) return 'tie'
    if (lower) return a < b ? 'a' : 'b'
    return a > b ? 'a' : 'b'
  }

  const sideA = comparison?.side_a
  const sideB = comparison?.side_b
  const bestGroupWinner = isBetter(sideA?.best_group_mm, sideB?.best_group_mm, true)
  const avgGroupWinner = isBetter(sideA?.avg_group_mm, sideB?.avg_group_mm, true)
  const velocitySDWinner = isBetter(sideA?.avg_velocity_sd, sideB?.avg_velocity_sd, true)

  const pelletAInfo = pellets.find(p => p.id === pelletA)
  const pelletBInfo = pellets.find(p => p.id === pelletB)

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-4xl mx-auto">
      <div>
        <Link to="/pellet-testing" className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors mb-3">
          <ChevronLeft size={14} /> Back
        </Link>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary flex items-center gap-2">
          <ArrowLeftRight size={20} /> Compare Pellets
        </h1>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Rifle</label>
          <select value={rifleId} onChange={e => setRifleId(e.target.value)} className={selectCls}>
            <option value="">Select rifle…</option>
            {rifles.map(r => (
              <option key={r.id} value={r.id}>{r.make} {r.model}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Pellet A</label>
          <select value={pelletA} onChange={e => setPelletA(e.target.value)} className={selectCls}>
            <option value="">Select pellet…</option>
            {pellets.filter(p => p.id !== pelletB).map(p => (
              <option key={p.id} value={p.id}>{p.brand} {p.model}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Pellet B</label>
          <select value={pelletB} onChange={e => setPelletB(e.target.value)} className={selectCls}>
            <option value="">Select pellet…</option>
            {pellets.filter(p => p.id !== pelletA).map(p => (
              <option key={p.id} value={p.id}>{p.brand} {p.model}</option>
            ))}
          </select>
        </div>
      </div>

      {!canCompare && (
        <p className="text-sm text-muted text-center py-8">Select a rifle and two different pellets to compare.</p>
      )}

      {isLoading && canCompare && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 border-2 border-[var(--brass)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--error-text)] text-center py-4">Not enough data to compare. Test both pellets with this rifle first.</p>
      )}

      {/* Comparison cards */}
      {comparison && sideA && sideB && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Side A */}
          <div className={`p-4 rounded border bg-surface ${bestGroupWinner === 'a' || avgGroupWinner === 'a' ? 'border-[var(--brass)]' : 'border-subtle'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-secondary">{pelletAInfo?.brand} {pelletAInfo?.model}</p>
                <p className="text-[11px] text-muted">{sideA.test_count} tests · {sideA.total_groups} groups</p>
              </div>
              {(bestGroupWinner === 'a' && avgGroupWinner === 'a') && (
                <Trophy size={18} className="text-[var(--brass)]" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Best Group" value={sideA.best_group_mm} unit="mm" highlight={bestGroupWinner === 'a'} />
              <Stat label="Avg Group" value={sideA.avg_group_mm} unit="mm" highlight={avgGroupWinner === 'a'} />
              <Stat label="Avg Velocity" value={sideA.avg_velocity_fps} unit="fps" />
              <Stat label="Velocity SD" value={sideA.avg_velocity_sd} highlight={velocitySDWinner === 'a'} />
              <Stat label="Consistency" value={sideA.consistency != null ? sideA.consistency.toFixed(2) : null} unit="σ" />
            </div>
          </div>

          {/* Side B */}
          <div className={`p-4 rounded border bg-surface ${bestGroupWinner === 'b' || avgGroupWinner === 'b' ? 'border-[var(--brass)]' : 'border-subtle'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-secondary">{pelletBInfo?.brand} {pelletBInfo?.model}</p>
                <p className="text-[11px] text-muted">{sideB.test_count} tests · {sideB.total_groups} groups</p>
              </div>
              {(bestGroupWinner === 'b' && avgGroupWinner === 'b') && (
                <Trophy size={18} className="text-[var(--brass)]" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Best Group" value={sideB.best_group_mm} unit="mm" highlight={bestGroupWinner === 'b'} />
              <Stat label="Avg Group" value={sideB.avg_group_mm} unit="mm" highlight={avgGroupWinner === 'b'} />
              <Stat label="Avg Velocity" value={sideB.avg_velocity_fps} unit="fps" />
              <Stat label="Velocity SD" value={sideB.avg_velocity_sd} highlight={velocitySDWinner === 'b'} />
              <Stat label="Consistency" value={sideB.consistency != null ? sideB.consistency.toFixed(2) : null} unit="σ" />
            </div>
          </div>
        </div>
      )}

      {/* Verdict */}
      {comparison && sideA && sideB && (
        <div className="p-4 rounded border border-subtle bg-surface text-center">
          <p className="text-[10px] tracking-widest uppercase text-muted mb-1">Verdict</p>
          {bestGroupWinner === avgGroupWinner && bestGroupWinner !== 'tie' ? (
            <p className="text-sm text-secondary">
              <span className="font-medium text-[var(--brass)]">
                {bestGroupWinner === 'a' ? `${pelletAInfo?.brand} ${pelletAInfo?.model}` : `${pelletBInfo?.brand} ${pelletBInfo?.model}`}
              </span>
              {' '}is the clear winner with better best and average group sizes.
            </p>
          ) : (
            <p className="text-sm text-muted flex items-center justify-center gap-1.5">
              <TrendingDown size={14} /> Too close to call — test more groups for a definitive answer.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
