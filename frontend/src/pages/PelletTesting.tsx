import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Plus,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Crosshair,
  LayoutGrid,
  Trophy,
  Tag,
  Target,
} from 'lucide-react'
import {
  pelletTestApi,
  type PelletTestSessionSummary,
  type ComboPerformanceSummary,
  type BatchReportEntry,
  type GroupTimelinePoint,
} from '../api/pelletTesting'
import { formatDate, formatDateShort, useRegionalPrefs } from '../utils/date'

type Tab = 'overview' | 'tests' | 'combos' | 'batches'

const TAB_ORDER: Tab[] = ['overview', 'tests', 'combos', 'batches']

const SERIES_COLORS = ['#a07b2c', '#4f7a3f', '#a8463a', '#7a5c8a', '#3a6f8a', '#b88a35']

function formatDistance(m: number, unit: string): string {
  if (unit === 'yards') return `${(m / 0.9144).toFixed(0)}yd`
  return `${m}m`
}

// ── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ groupCount, isTopCombo }: { groupCount: number; isTopCombo?: boolean }) {
  if (isTopCombo) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-tint text-gold border border-gold/40 text-[10px] uppercase tracking-widest font-medium">
        <Trophy size={10} /> Top Combo
      </span>
    )
  }
  if (groupCount === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-2 border border-line text-[10px] uppercase tracking-widest text-muted">
        Draft
      </span>
    )
  }
  if (groupCount < 3) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gold-tint/60 text-gold border border-gold/30 text-[10px] uppercase tracking-widest font-medium">
        Emerging · {groupCount}/3 grp
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-soft text-[var(--green)] border border-[var(--green)]/30 text-[10px] uppercase tracking-widest font-medium">
      Complete · {groupCount} groups
    </span>
  )
}

// ── Big serif numeral ──────────────────────────────────────────────────────
function SerifNumber({ value, suffix, size = 'lg' }: { value: string; suffix?: string; size?: 'md' | 'lg' | 'xl' }) {
  const sizeCls =
    size === 'xl'
      ? 'text-4xl lg:text-5xl'
      : size === 'lg'
        ? 'text-3xl lg:text-4xl'
        : 'text-2xl lg:text-3xl'
  return (
    <span className={`font-serif-display tracking-tight text-ink ${sizeCls}`}>
      {value}
      {suffix && <span className="text-[10px] uppercase tracking-widest text-muted ml-1 align-baseline font-sans">{suffix}</span>}
    </span>
  )
}

// ── Target thumbnail ───────────────────────────────────────────────────────
function TargetThumb({ src, fallbackHole = false }: { src?: string; fallbackHole?: boolean }) {
  if (src) {
    return (
      <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full border border-line bg-surface-2 overflow-hidden shrink-0">
        <img src={src} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full border border-line bg-surface-2 flex items-center justify-center shrink-0">
      {fallbackHole ? (
        <Crosshair size={20} className="text-muted opacity-50" />
      ) : (
        <Target size={20} className="text-muted opacity-40" />
      )}
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────
function TabBar({
  tab,
  counts,
  onChange,
}: {
  tab: Tab
  counts: { tests?: number; combos?: number; batches?: number }
  onChange: (t: Tab) => void
}) {
  const items: { key: Tab; label: string; icon: React.ComponentType<{ size?: number | string }>; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutGrid },
    { key: 'tests', label: 'Tests', icon: Crosshair, count: counts.tests },
    { key: 'combos', label: 'Combos', icon: Trophy, count: counts.combos },
    { key: 'batches', label: 'Batches', icon: Tag, count: counts.batches },
  ]
  return (
    <div className="flex items-end gap-6 lg:gap-8 border-b border-line overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
      {items.map(({ key, label, icon: Icon, count }) => {
        const active = tab === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`relative flex items-center gap-2 pb-3 pt-1 whitespace-nowrap transition-colors ${
              active ? 'text-ink' : 'text-muted hover:text-ink-2'
            }`}
          >
            <Icon size={14} />
            <span className="text-sm">{label}</span>
            {count != null && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  active ? 'bg-gold-tint text-gold' : 'bg-bg-2 text-muted'
                }`}
              >
                {count}
              </span>
            )}
            {active && (
              <span className="absolute left-0 right-0 -bottom-px h-px bg-gold" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Floating Capture CTA ──────────────────────────────────────────────────
function FloatingCapture() {
  return (
    <Link
      to="/pellet-testing/new"
      className="fixed right-4 lg:right-8 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-gold text-inverse text-[11px] tracking-widest uppercase font-medium shadow-card-hover hover:opacity-95 transition-opacity"
      style={{ bottom: 'calc(var(--mobile-nav-offset, 16px) + 16px)' }}
    >
      <Camera size={14} /> Capture Target
    </Link>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────
function OverviewTab({
  recent,
  topCombos,
  timeline,
  loading,
}: {
  recent: PelletTestSessionSummary[]
  topCombos: ComboPerformanceSummary[]
  timeline: GroupTimelinePoint[]
  loading: boolean
}) {
  const prefs = useRegionalPrefs()

  // Build per-pellet timeline series (one line per pellet, best of day)
  const { chartData, seriesNames } = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>()
    const namesSet = new Set<string>()
    for (const p of timeline) {
      if (p.group_size_mm == null) continue
      const name = `${p.pellet_brand} ${p.pellet_model}`
      namesSet.add(name)
      const d = p.test_date
      if (!dateMap.has(d)) dateMap.set(d, {})
      const entry = dateMap.get(d)!
      const v = Number(p.group_size_mm.toFixed(2))
      const prev = entry[name]
      if (prev == null || v < prev) entry[name] = v
    }
    const data = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }))
    return { chartData: data, seriesNames: [...namesSet] }
  }, [timeline])

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Performance over time */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif-display text-2xl lg:text-3xl text-ink">Performance over time</h2>
          <p className="text-sm text-muted mt-0.5">Best group per session, by pellet — lower is better.</p>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4 lg:p-6 shadow-card">
          {loading && timeline.length === 0 ? (
            <div className="h-64 rounded bg-surface-2 animate-pulse" />
          ) : timeline.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted">
              No timeline data yet.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {seriesNames.map((name, i) => (
                  <span key={name} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    />
                    {name}
                  </span>
                ))}
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      tickFormatter={(v: string) => formatDateShort(v, prefs)}
                      stroke="var(--line)"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => `${v.toFixed(1)}mm`}
                      stroke="var(--line)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                      labelStyle={{ color: 'var(--muted)' }}
                      formatter={(v) => `${Number(v).toFixed(2)}mm`}
                    />
                    {seriesNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={1.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Recent + Top combos */}
      <section className="grid lg:grid-cols-2 gap-8 lg:gap-10">
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-serif-display text-xl text-ink">Recent test sessions</h3>
            <span className="text-[11px] text-muted">Last {Math.min(recent.length, 5)} of {recent.length}</span>
          </div>
          {recent.length === 0 ? (
            <Link
              to="/pellet-testing/new"
              className="block text-center p-6 border border-dashed border-line rounded-lg text-sm text-muted hover:border-gold/40 transition-colors"
            >
              Log your first pellet test
            </Link>
          ) : (
            <div className="space-y-2">
              {recent.slice(0, 5).map(t => (
                <RecentSessionRow key={t.id} test={t} />
              ))}
            </div>
          )}
          {recent.length > 5 && (
            <Link
              to="/pellet-testing"
              search={{ tab: 'tests' }}
              className="block mt-3 text-right text-[11px] tracking-widest uppercase text-gold hover:opacity-80"
            >
              All tests <ChevronRight size={11} className="inline -mt-px" />
            </Link>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-serif-display text-xl text-ink">Top combos</h3>
            <Link
              to="/pellet-testing"
              search={{ tab: 'combos' }}
              className="text-[11px] tracking-widest uppercase text-gold hover:opacity-80"
            >
              All combos <ChevronRight size={11} className="inline -mt-px" />
            </Link>
          </div>
          <p className="text-xs text-muted mb-2">Best rifle × pellet pairings</p>
          {topCombos.length === 0 ? (
            <p className="text-sm text-muted text-center py-6 border border-dashed border-line rounded-lg">
              No combo data yet.
            </p>
          ) : (
            <div className="space-y-2">
              {topCombos.slice(0, 5).map((c, i) => (
                <TopComboRow key={`${c.rifle_id}-${c.pellet_id}`} combo={c} rank={i + 1} highlight={i === 0} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function RecentSessionRow({ test }: { test: PelletTestSessionSummary }) {
  const prefs = useRegionalPrefs()
  return (
    <Link
      to="/pellet-testing/$id"
      params={{ id: test.id }}
      className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-lg bg-surface border border-line hover:border-gold/40 hover:shadow-card transition-all"
    >
      <TargetThumb src={test.first_image_url} />
      <div className="flex-1 min-w-0">
        <p className="font-serif-display text-lg lg:text-xl text-ink leading-tight truncate">
          {test.pellet_brand} {test.pellet_model}
        </p>
        <p className="text-xs text-muted truncate">{test.rifle_make} {test.rifle_model}</p>
        <p className="text-[11px] text-muted mt-0.5">
          {formatDate(test.test_date, prefs)} · {formatDistance(test.distance_m, test.distance_unit)} · {test.group_count} {test.group_count === 1 ? 'group' : 'groups'}
        </p>
      </div>
      <div className="text-right shrink-0 ml-2">
        {test.best_group_size_mm != null ? (
          <>
            <SerifNumber value={test.best_group_size_mm.toFixed(2)} size="md" />
            <p className="text-[10px] tracking-widest uppercase text-muted">mm best</p>
          </>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </div>
    </Link>
  )
}

function TopComboRow({
  combo,
  rank,
  highlight,
}: {
  combo: ComboPerformanceSummary
  rank: number
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-lg border transition-all ${
        highlight
          ? 'bg-gold-tint/30 border-gold/40'
          : 'bg-surface border-line hover:border-gold/40'
      }`}
    >
      <span className="font-serif-display text-2xl text-muted-2 w-6 text-center shrink-0">{rank}</span>
      <TargetThumb />
      <div className="flex-1 min-w-0">
        <p className={`font-serif-display text-lg lg:text-xl leading-tight truncate ${highlight ? 'text-gold' : 'text-ink'}`}>
          {combo.pellet_name}
        </p>
        <p className="text-xs text-muted truncate">{combo.rifle_name}</p>
        <p className="text-[11px] text-muted mt-0.5">
          {combo.test_count} {combo.test_count === 1 ? 'test' : 'tests'}
          {combo.avg_group_mm != null && ` · ${combo.avg_group_mm.toFixed(2)}mm avg`}
        </p>
      </div>
      <div className="text-right shrink-0 ml-2">
        {combo.best_group_mm != null ? (
          <>
            <SerifNumber value={combo.best_group_mm.toFixed(2)} size="md" />
            <p className="text-[10px] tracking-widest uppercase text-muted">mm best</p>
          </>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </div>
    </div>
  )
}

// ── Tests tab ──────────────────────────────────────────────────────────────
function TestsTab({
  tests,
  topComboKey,
}: {
  tests: PelletTestSessionSummary[]
  topComboKey: string | null
}) {
  const prefs = useRegionalPrefs()
  const [sort, setSort] = useState<'newest' | 'smallest'>('newest')
  const [rifleFilter, setRifleFilter] = useState<string>('all')
  const [pelletFilter, setPelletFilter] = useState<string>('all')

  const rifles = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tests) {
      const k = `${t.rifle_make} ${t.rifle_model}`
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
  }, [tests])

  const pellets = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tests) {
      const k = `${t.pellet_brand} ${t.pellet_model}`
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
  }, [tests])

  const filtered = useMemo(() => {
    const list = tests.filter(t => {
      if (rifleFilter !== 'all' && `${t.rifle_make} ${t.rifle_model}` !== rifleFilter) return false
      if (pelletFilter !== 'all' && `${t.pellet_brand} ${t.pellet_model}` !== pelletFilter) return false
      return true
    })
    list.sort((a, b) => {
      if (sort === 'smallest') {
        const av = a.best_group_size_mm ?? Infinity
        const bv = b.best_group_size_mm ?? Infinity
        return av - bv
      }
      return b.test_date.localeCompare(a.test_date)
    })
    return list
  }, [tests, rifleFilter, pelletFilter, sort])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-serif-display text-2xl lg:text-3xl text-ink">Test sessions</h2>
          <p className="text-xs text-muted mt-0.5">{filtered.length} of {tests.length} tests</p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSort('newest')}
            className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest transition-colors ${
              sort === 'newest' ? 'bg-ink text-inverse' : 'border border-line text-muted hover:text-ink-2'
            }`}
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setSort('smallest')}
            className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest transition-colors ${
              sort === 'smallest' ? 'bg-ink text-inverse' : 'border border-line text-muted hover:text-ink-2'
            }`}
          >
            <Trophy size={11} className="inline -mt-px mr-1" /> Smallest groups
          </button>
        </div>
      </div>

      {(rifles.length > 1 || pellets.length > 1) && (
        <div className="space-y-2">
          {rifles.length > 1 && (
            <FilterRow
              label="Rifle"
              value={rifleFilter}
              total={tests.length}
              options={rifles}
              onChange={setRifleFilter}
            />
          )}
          {pellets.length > 1 && (
            <FilterRow
              label="Pellet"
              value={pelletFilter}
              total={tests.length}
              options={pellets}
              onChange={setPelletFilter}
            />
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted">No tests match these filters.</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(t => {
            const isTop =
              topComboKey != null &&
              `${t.rifle_make} ${t.rifle_model}|${t.pellet_brand} ${t.pellet_model}` === topComboKey
            return (
              <TestRow key={t.id} test={t} prefs={prefs} isTop={isTop} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  label,
  value,
  options,
  total,
  onChange,
}: {
  label: string
  value: string
  options: [string, number][]
  total: number
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
      <span className="text-[10px] uppercase tracking-widest text-muted shrink-0 w-12">{label}</span>
      <Chip active={value === 'all'} count={total} onClick={() => onChange('all')}>
        All
      </Chip>
      {options.map(([name, count]) => (
        <Chip key={name} active={value === name} count={count} onClick={() => onChange(name)}>
          {name}
        </Chip>
      ))}
    </div>
  )
}

function Chip({
  children,
  count,
  active,
  onClick,
}: {
  children: React.ReactNode
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-inverse' : 'border border-line text-ink-2 hover:border-gold/40'
      }`}
    >
      {children}
      {count != null && (
        <span
          className={`text-[10px] font-mono px-1 rounded ${
            active ? 'bg-inverse/20' : 'bg-bg-2 text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function TestRow({
  test,
  prefs,
  isTop,
}: {
  test: PelletTestSessionSummary
  prefs: ReturnType<typeof useRegionalPrefs>
  isTop: boolean
}) {
  return (
    <Link
      to="/pellet-testing/$id"
      params={{ id: test.id }}
      className={`flex items-center gap-3 lg:gap-4 p-3 lg:p-4 rounded-lg bg-surface border transition-all hover:shadow-card ${
        isTop ? 'border-gold/50 bg-gold-tint/10' : 'border-line hover:border-gold/40'
      }`}
    >
      <TargetThumb src={test.first_image_url} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink-2">{formatDate(test.test_date, prefs)}</span>
          <span className="font-serif-display text-lg text-ink leading-tight truncate">
            {test.rifle_make} {test.rifle_model}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill groupCount={test.group_count} isTopCombo={isTop} />
        </div>
        <p className="text-xs text-ink-2 truncate">
          <span className="text-gold">{test.pellet_brand} {test.pellet_model}</span>
          <span className="text-muted"> · {formatDistance(test.distance_m, test.distance_unit)}</span>
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-6 lg:gap-8 shrink-0 text-right">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Best group</p>
          {test.best_group_size_mm != null ? (
            <>
              <SerifNumber value={test.best_group_size_mm.toFixed(2)} size="md" />
            </>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Avg</p>
          {test.average_group_size_mm != null ? (
            <SerifNumber value={test.average_group_size_mm.toFixed(2)} size="md" />
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
          <p className="text-[10px] text-muted">{test.group_count} {test.group_count === 1 ? 'group' : 'groups'}</p>
        </div>
      </div>
      <div className="sm:hidden text-right shrink-0">
        {test.best_group_size_mm != null ? (
          <SerifNumber value={test.best_group_size_mm.toFixed(2)} size="md" />
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
        <p className="text-[10px] uppercase tracking-widest text-muted">mm</p>
      </div>
    </Link>
  )
}

// ── Combos tab ─────────────────────────────────────────────────────────────
type ComboSort = 'best' | 'avg' | 'consistency'

function CombosTab({ combos }: { combos: ComboPerformanceSummary[] }) {
  const [sort, setSort] = useState<ComboSort>('best')

  const sorted = useMemo(() => {
    return [...combos].sort((a, b) => {
      if (sort === 'consistency') {
        const av = a.consistency ?? Infinity
        const bv = b.consistency ?? Infinity
        return av - bv
      }
      const key = sort === 'avg' ? 'avg_group_mm' : 'best_group_mm'
      const av = a[key] ?? Infinity
      const bv = b[key] ?? Infinity
      return av - bv
    })
  }, [combos, sort])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-serif-display text-2xl lg:text-3xl text-ink">Rifle × pellet combos</h2>
          <p className="text-xs text-muted mt-0.5">Aggregated across all test sessions. Lower is better.</p>
        </div>
        <div className="flex gap-1.5">
          <SortPill active={sort === 'best'} onClick={() => setSort('best')}>Best group</SortPill>
          <SortPill active={sort === 'avg'} onClick={() => setSort('avg')}>Avg</SortPill>
          <SortPill active={sort === 'consistency'} onClick={() => setSort('consistency')}>Consistency</SortPill>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted">No combo data yet.</p>
      ) : (
        <div className="bg-surface border border-line rounded-lg overflow-hidden shadow-card">
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-[var(--line)]">
            {sorted.map((c, i) => (
              <ComboCardMobile key={`${c.rifle_id}-${c.pellet_id}`} combo={c} rank={i + 1} />
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-2 border-b border-line text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-4 py-3 text-left font-normal w-12">#</th>
                  <th className="px-4 py-3 text-left font-normal">Combo</th>
                  <th className="px-4 py-3 text-right font-normal">Tests</th>
                  <th className="px-4 py-3 text-right font-normal">Best</th>
                  <th className="px-4 py-3 text-right font-normal">Avg</th>
                  <th className="px-4 py-3 text-right font-normal">σ</th>
                  <th className="px-4 py-3 text-right font-normal">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {sorted.map((c, i) => (
                  <tr key={`${c.rifle_id}-${c.pellet_id}`} className="hover:bg-bg-2/50">
                    <td className="px-4 py-3 font-serif-display text-xl text-muted-2">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-serif-display text-lg text-ink leading-tight">{c.pellet_name}</p>
                      <p className="text-xs text-muted">{c.rifle_name}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink-2">{c.test_count}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-serif-display text-lg text-gold">
                        {c.best_group_mm != null ? c.best_group_mm.toFixed(2) : '—'}
                      </span>
                      <span className="text-[10px] text-muted ml-0.5">mm</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink-2">
                      {c.avg_group_mm != null ? `${c.avg_group_mm.toFixed(2)}mm` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink-2">
                      {c.consistency != null ? c.consistency.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                      {c.last_tested.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest transition-colors ${
        active ? 'bg-ink text-inverse' : 'border border-line text-muted hover:text-ink-2'
      }`}
    >
      {children}
    </button>
  )
}

function ComboCardMobile({ combo, rank }: { combo: ComboPerformanceSummary; rank: number }) {
  return (
    <div className="p-4 flex items-center gap-3">
      <span className="font-serif-display text-2xl text-muted-2 w-6 text-center shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="font-serif-display text-lg text-ink leading-tight truncate">{combo.pellet_name}</p>
        <p className="text-xs text-muted truncate">{combo.rifle_name}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-2">
          <span>{combo.test_count} tests</span>
          {combo.avg_group_mm != null && <span className="text-muted">avg {combo.avg_group_mm.toFixed(2)}mm</span>}
          {combo.consistency != null && <span className="text-muted">σ {combo.consistency.toFixed(2)}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        {combo.best_group_mm != null ? (
          <>
            <SerifNumber value={combo.best_group_mm.toFixed(2)} size="md" />
            <p className="text-[10px] tracking-widest uppercase text-muted">mm best</p>
          </>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </div>
    </div>
  )
}

// ── Batches tab ────────────────────────────────────────────────────────────
function BatchesTab({ batches }: { batches: BatchReportEntry[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif-display text-2xl lg:text-3xl text-ink">Pellet batches</h2>
        <p className="text-xs text-muted mt-0.5">
          Cross-batch performance for every lot you've tested. Add lot codes to pellets in{' '}
          <Link to="/gear" className="text-gold hover:underline">Gear</Link>.
        </p>
      </div>

      {batches.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted">
          No batch data yet — tag your pellets with a lot/batch code to see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {batches.map(b => (
            <BatchCard key={`${b.batch_code}-${b.pellet_brand}-${b.pellet_model}`} batch={b} />
          ))}
        </div>
      )}
    </div>
  )
}

function BatchCard({ batch }: { batch: BatchReportEntry }) {
  return (
    <article className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif-display text-xl lg:text-2xl text-ink leading-tight">
            {batch.pellet_brand} {batch.pellet_model}
          </h3>
          <p className="text-xs text-muted font-mono mt-0.5">Lot {batch.batch_code}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-bg-2 border border-line flex items-center justify-center shrink-0">
          <Tag size={14} className="text-muted" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Best</p>
          {batch.best_group_mm != null ? (
            <SerifNumber value={`${batch.best_group_mm.toFixed(2)}mm`} size="md" />
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Avg</p>
          {batch.avg_group_mm != null ? (
            <SerifNumber value={`${batch.avg_group_mm.toFixed(2)}mm`} size="md" />
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Tests</p>
          <SerifNumber value={String(batch.test_count)} size="md" />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{batch.total_groups} {batch.total_groups === 1 ? 'group' : 'groups'} logged</span>
        {batch.consistency_score != null && (
          <span className="font-mono">σ {batch.consistency_score.toFixed(2)}</span>
        )}
      </div>
      <p className="text-[11px] text-muted">Last tested {batch.last_tested.slice(0, 10)}</p>
    </article>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PelletTesting() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const tab: Tab = TAB_ORDER.includes(search.tab as Tab) ? (search.tab as Tab) : 'overview'

  const setTab = (t: Tab) => {
    navigate({ to: '/pellet-testing', search: t === 'overview' ? {} : { tab: t } })
  }

  const { data: testsData } = useQuery({
    queryKey: ['pellet-tests', 'all'],
    queryFn: () => pelletTestApi.list(100, 0),
  })
  const { data: combosData } = useQuery({
    queryKey: ['combo-analytics', null],
    queryFn: () => pelletTestApi.comboAnalytics(),
  })
  const { data: batchesData } = useQuery({
    queryKey: ['pellet-test-batch-report'],
    queryFn: () => pelletTestApi.batchReport(),
  })
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['pellet-timeline-overview'],
    queryFn: () => pelletTestApi.timeline(),
  })

  const tests = useMemo(() => testsData?.items ?? [], [testsData])
  const combos = useMemo(() => combosData?.items ?? [], [combosData])
  const batches = useMemo(() => batchesData?.items ?? [], [batchesData])
  const timeline = useMemo(() => timelineData?.items ?? [], [timelineData])

  const sortedCombos = useMemo(() => {
    return [...combos].sort((a, b) => (a.best_group_mm ?? Infinity) - (b.best_group_mm ?? Infinity))
  }, [combos])

  const topComboKey = useMemo(() => {
    const top = sortedCombos[0]
    return top ? `${top.rifle_name}|${top.pellet_name}` : null
  }, [sortedCombos])

  return (
    <div className="bg-bg min-h-screen">
      <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-5xl xl:max-w-6xl mx-auto pb-32">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-serif-display text-3xl lg:text-5xl text-ink leading-tight">Pellet testing</h1>
            <p className="text-sm text-ink-2 mt-1">Find the smallest groups. Track lot-to-lot. Pick the right pellet for the rifle.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pellet-testing/new"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-line text-xs uppercase tracking-widest text-ink-2 hover:border-gold/40 transition-colors"
            >
              <ImageIcon size={13} /> Capture target
            </Link>
            <Link
              to="/pellet-testing/new"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-gold text-inverse text-xs uppercase tracking-widest font-medium hover:opacity-95 transition-opacity"
            >
              <Plus size={13} /> New test
            </Link>
          </div>
        </div>

        <TabBar
          tab={tab}
          onChange={setTab}
          counts={{ tests: tests.length, combos: combos.length, batches: batches.length }}
        />

        {tab === 'overview' && (
          <OverviewTab
            recent={tests}
            topCombos={sortedCombos}
            timeline={timeline}
            loading={timelineLoading}
          />
        )}
        {tab === 'tests' && <TestsTab tests={tests} topComboKey={topComboKey} />}
        {tab === 'combos' && <CombosTab combos={combos} />}
        {tab === 'batches' && <BatchesTab batches={batches} />}
      </div>

      <FloatingCapture />
    </div>
  )
}

