import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  ChevronLeft, ChevronRight, Crosshair, Eye, Layers, Package, Search, Users, X,
} from 'lucide-react'
import {
  adminGearApi,
  type AdminGearModel, type AdminGearSlice, type AdminGearSort, type GearKind,
} from '../api/adminGear'
import { SERIES_COMMUNITY, SERIES_YOU } from '../components/GearCharts'

const PAGE_SIZE = 25

const AXIS_TICK = { fontSize: 10, fill: 'var(--color-text-muted, #888)' }
const GRID_STROKE = 'var(--color-border-subtle, #333)'
const TOOLTIP_STYLE = {
  background: 'var(--color-bg-surface, #1a1a1a)',
  border: '1px solid var(--color-border-subtle, #333)',
  borderRadius: 6,
  fontSize: 11,
}
const TOOLTIP_LABEL = { color: 'var(--color-text-muted, #888)' }

const num = (v: number | undefined, digits = 0) => v == null ? '—' : v.toFixed(digits)
const mm = (v: number | undefined) => v == null ? '—' : `${v.toFixed(2)}mm`

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-subtle rounded-lg px-3 py-2.5 space-y-0.5">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className="t-mono text-lg leading-tight text-primary">{value}</p>
      {sub && <p className="text-[10px] text-muted tracking-wide">{sub}</p>}
    </div>
  )
}

function Panel({ title, icon: Icon, hint, children }: {
  title: string
  icon?: typeof Package
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
 * Single-series ranked bars. One measure, one hue — the ranking is carried by
 * bar length and the row order, never by colour, so no palette is cycled.
 */
function SliceChart({ slices, unitLabel }: { slices: AdminGearSlice[]; unitLabel: string }) {
  if (slices.length === 0) {
    return <p className="text-sm text-muted">No gear recorded yet.</p>
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={slices} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={104} interval={0} />
          <Tooltip
            cursor={{ fill: GRID_STROKE, fillOpacity: 0.25 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL}
            formatter={(value, _name, entry) => {
              const share = (entry?.payload as AdminGearSlice | undefined)?.share
              return [`${value} ${unitLabel}${share != null ? ` (${share}%)` : ''}`, 'Count']
            }}
          />
          <Bar dataKey="count" fill={SERIES_YOU} radius={[0, 4, 4, 0]} maxBarSize={18}>
            {slices.map((s) => <Cell key={s.label} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ModelTable({
  items, kind, onSelect, sort, onSort,
}: {
  items: AdminGearModel[]
  kind: GearKind
  onSelect: (m: AdminGearModel) => void
  sort: AdminGearSort
  onSort: (s: AdminGearSort) => void
}) {
  const columns: { key: AdminGearSort | null; label: string; className?: string }[] = [
    { key: 'name', label: kind === 'pellet' ? 'Brand / Model' : 'Make / Model' },
    { key: 'owners', label: 'Owners', className: 'text-right' },
    { key: 'items', label: 'Items', className: 'text-right' },
    { key: null, label: 'Opted in', className: 'text-right' },
    { key: 'cards', label: 'Cards', className: 'text-right' },
    { key: 'avg_score', label: 'Avg', className: 'text-right' },
    { key: 'best_score', label: 'Best', className: 'text-right' },
    { key: 'best_group', label: 'Best grp', className: 'text-right' },
    { key: 'recent', label: 'Last used', className: 'text-right' },
  ]

  if (items.length === 0) {
    return <p className="text-sm text-muted">No gear models match this filter.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-subtle">
            {columns.map(c => (
              <th key={c.label} className={`py-2 px-2 text-[10px] tracking-widest uppercase text-muted font-medium whitespace-nowrap ${c.className ?? 'text-left'}`}>
                {c.key ? (
                  <button
                    onClick={() => onSort(c.key as AdminGearSort)}
                    className={`hover:text-secondary transition-colors ${sort === c.key ? 'text-[var(--brass)]' : ''}`}
                  >
                    {c.label}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(m => (
            <tr
              key={`${m.make}-${m.model}`}
              onClick={() => onSelect(m)}
              className="border-b border-subtle last:border-0 hover:bg-surface-hover cursor-pointer transition-colors"
            >
              <td className="py-2 px-2">
                <p className="text-secondary">{m.make} {m.model}</p>
                <p className="text-[10px] text-muted tracking-wide">first seen {m.first_seen}</p>
              </td>
              <td className="py-2 px-2 text-right t-mono text-secondary">{m.owner_count}</td>
              <td className="py-2 px-2 text-right t-mono text-muted">{m.item_count}</td>
              <td className="py-2 px-2 text-right t-mono text-muted">
                {m.opted_in_count}/{m.item_count}
              </td>
              <td className="py-2 px-2 text-right t-mono text-muted">{m.card_count}</td>
              <td className="py-2 px-2 text-right t-mono text-secondary">{num(m.avg_score, 1)}</td>
              <td className="py-2 px-2 text-right t-mono text-[var(--brass)]">{num(m.best_score)}</td>
              <td className="py-2 px-2 text-right t-mono text-muted">{mm(m.best_group_mm)}</td>
              <td className="py-2 px-2 text-right t-mono text-muted whitespace-nowrap">{m.last_used ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Drill-down for one gear model: who owns it, and how the site scores with it. */
function ModelDetailDrawer({ kind, make, model, onClose }: {
  kind: GearKind
  make: string
  model: string
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-gear-model', kind, make, model],
    queryFn: () => adminGearApi.getModelDetail(kind, make, model),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${make} ${model} detail`}>
      <button className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full overflow-y-auto bg-bg border-l border-subtle p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="t-page-title normal-case tracking-normal text-primary">{make} {model}</h2>
            <p className="text-[11px] text-muted tracking-widest uppercase">{kind}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isLoading && <div className="h-40 rounded-lg bg-surface animate-pulse" />}
        {isError && <p className="text-sm text-[var(--error-text)]">Failed to load this model.</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Metric label="Owners" value={String(data.model.owner_count)} />
              <Metric label="Items" value={String(data.model.item_count)} sub={`${data.model.opted_in_count} opted in`} />
              <Metric label="Cards" value={String(data.model.card_count)} sub={`${data.model.test_count} tests`} />
              <Metric label="Best" value={num(data.model.best_score)} sub={`avg ${num(data.model.avg_score, 1)}`} />
            </div>

            <Panel title="Site-wide score trend" hint="monthly average">
              {data.trend.length === 0 ? (
                <p className="text-sm text-muted">No dated cards for this model yet.</p>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trend} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} />
                      <XAxis dataKey="period" tick={AXIS_TICK} tickFormatter={(v: string) => v.slice(0, 7)} />
                      <YAxis tick={AXIS_TICK} width={38} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL}
                        formatter={(value) => [Number(value).toFixed(1), 'Average']}
                      />
                      <Line type="monotone" dataKey="avg_score" stroke={SERIES_YOU} strokeWidth={2} dot={{ r: 3, fill: SERIES_YOU }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Owners" icon={Users} hint={`${data.owners.length} shown`}>
              {data.owners.length === 0 ? (
                <p className="text-sm text-muted">No owners found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-subtle">
                        {['Owner', 'Opted in', 'Cards', 'Avg', 'Best', 'Best grp', 'Added'].map((h, i) => (
                          <th key={h} className={`py-2 px-2 text-[10px] tracking-widest uppercase text-muted font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.owners.map(o => (
                        <tr key={o.user_id} className="border-b border-subtle last:border-0">
                          <td className="py-2 px-2">
                            <p className="text-secondary truncate max-w-[180px]">
                              {o.display_name}
                              {o.is_simulated && (
                                <span className="ml-1.5 text-[9px] tracking-widest uppercase text-muted border border-subtle rounded px-1">sim</span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted truncate max-w-[180px]">{o.email}</p>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span className={o.opted_in ? 'text-[var(--brass)]' : 'text-muted'}>{o.opted_in ? 'Yes' : 'No'}</span>
                          </td>
                          <td className="py-2 px-2 text-right t-mono text-muted">{o.card_count}</td>
                          <td className="py-2 px-2 text-right t-mono text-secondary">{num(o.avg_score, 1)}</td>
                          <td className="py-2 px-2 text-right t-mono text-[var(--brass)]">{num(o.best_score)}</td>
                          <td className="py-2 px-2 text-right t-mono text-muted">{mm(o.best_group_mm)}</td>
                          <td className="py-2 px-2 text-right t-mono text-muted whitespace-nowrap">{o.added_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminGearStats() {
  const [kind, setKind] = useState<GearKind>('rifle')
  const [sort, setSort] = useState<AdminGearSort>('owners')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<AdminGearModel | null>(null)

  const statsQuery = useQuery({
    queryKey: ['admin-gear-stats'],
    queryFn: adminGearApi.getStats,
  })

  const modelsQuery = useQuery({
    queryKey: ['admin-gear-models', kind, sort, search, offset],
    queryFn: () => adminGearApi.listModels({ kind, sort, q: search, limit: PAGE_SIZE, offset }),
  })

  const stats = statsQuery.data
  const models = modelsQuery.data?.items ?? []
  const total = modelsQuery.data?.total ?? 0

  const resetPaging = () => setOffset(0)

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5">
      <h1 className="t-page-title flex items-center gap-2">
        <Package size={20} aria-hidden="true" /> Gear Analytics
      </h1>
      <p className="t-page-subtitle">
        Every rifle and pellet registered on sub-12, and how much of it feeds public comparison.
      </p>

      {statsQuery.isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />)}
        </div>
      )}
      {statsQuery.error && <p className="text-sm text-[var(--error-text)]">Failed to load gear stats.</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <Metric label="Rifles" value={String(stats.totals.rifles)} sub={`${stats.totals.rifle_models} models`} />
            <Metric label="Pellets" value={String(stats.totals.pellets)} sub={`${stats.totals.pellet_models} models`} />
            <Metric label="Owners" value={String(stats.totals.owners_with_gear)} sub={`${stats.totals.avg_rifles_per_owner} rifles each`} />
            <Metric label="Opt-in rate" value={`${stats.totals.opt_in_rate}%`} sub={`${stats.totals.rifles_opted_in + stats.totals.pellets_opted_in} items`} />
            <Metric label="Cards w/ gear" value={String(stats.totals.cards_with_rifle)} sub={`${stats.totals.orphan_cards} unattributed`} />
            <Metric label="With images" value={String(stats.totals.rifles_with_images + stats.totals.pellets_with_images)} sub="rifles + pellets" />
          </div>

          <Panel title="Gear added over time" hint="last 12 months">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stats.adoption} margin={{ top: 6, right: 8, bottom: 4, left: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="period" tick={AXIS_TICK} tickFormatter={(v: string) => v.slice(0, 7)} />
                  <YAxis tick={AXIS_TICK} width={38} />
                  <Tooltip
                    cursor={{ fill: GRID_STROKE, fillOpacity: 0.25 }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL}
                    formatter={(value, name) => [value as number, name === 'rifles' ? 'Rifles' : 'Pellets']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                    formatter={(value) => (
                      <span style={{ color: 'var(--color-text-muted, #888)' }}>{value === 'rifles' ? 'Rifles' : 'Pellets'}</span>
                    )}
                  />
                  <Bar dataKey="rifles" name="rifles" fill={SERIES_YOU} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="pellets" name="pellets" fill={SERIES_COMMUNITY} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Rifle makes" icon={Package} hint="by items registered">
              <SliceChart slices={stats.rifle_make_split} unitLabel="rifles" />
            </Panel>
            <Panel title="Pellet brands" icon={Package} hint="by items registered">
              <SliceChart slices={stats.pellet_brand_split} unitLabel="pellets" />
            </Panel>
            <Panel title="Calibre split" icon={Crosshair}>
              <SliceChart slices={stats.calibre_split} unitLabel="rifles" />
            </Panel>
            <Panel title="Power bands" icon={Crosshair}>
              <SliceChart slices={stats.power_split} unitLabel="rifles" />
            </Panel>
            <Panel title="Pellet weights" icon={Layers}>
              <SliceChart slices={stats.pellet_weight_split} unitLabel="pellets" />
            </Panel>
            <Panel title="Top combinations" icon={Layers} hint="by shooters running them">
              {stats.top_combos.length === 0 ? (
                <p className="text-sm text-muted">No rifle + pellet combinations recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.top_combos.map((c, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-secondary truncate">
                        {c.rifle_make} {c.rifle_model} <span className="text-muted">+</span> {c.pellet_brand} {c.pellet_model}
                      </span>
                      <span className="shrink-0 t-mono text-xs text-muted">
                        {c.user_count} · {num(c.avg_score, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* Model leaderboard */}
      <Panel title="All gear models" icon={Eye} hint={`${total} model${total === 1 ? '' : 's'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(['rifle', 'pellet'] as GearKind[]).map(k => (
              <button
                key={k}
                onClick={() => { setKind(k); resetPaging() }}
                className={`px-3 py-1.5 rounded border text-[10px] tracking-widest uppercase transition-colors ${
                  kind === k ? 'border-[var(--brass)] bg-[var(--brass)] text-inverse' : 'border-subtle text-muted hover:text-secondary'
                }`}
              >
                {k}s
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-1.5 flex-1 min-w-[180px]"
            onSubmit={e => { e.preventDefault(); setSearch(query); resetPaging() }}
          >
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={kind === 'pellet' ? 'Search brand or model…' : 'Search make or model…'}
              className="flex-1 bg-surface border border-subtle rounded px-3 py-1.5 text-primary text-xs placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
            />
            <button type="submit" className="p-1.5 text-muted hover:text-[var(--brass)] transition-colors" aria-label="Search">
              <Search size={15} />
            </button>
          </form>
        </div>

        {modelsQuery.isLoading && <div className="h-40 rounded bg-surface-hover animate-pulse" />}
        {modelsQuery.error && <p className="text-sm text-[var(--error-text)]">Failed to load gear models.</p>}
        {!modelsQuery.isLoading && !modelsQuery.error && (
          <ModelTable
            items={models}
            kind={kind}
            sort={sort}
            onSort={s => { setSort(s); resetPaging() }}
            onSelect={setSelected}
          />
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted hover:text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-[11px] text-muted t-mono">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted hover:text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </Panel>

      {selected && (
        <ModelDetailDrawer
          kind={selected.kind}
          make={selected.make}
          model={selected.model}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
