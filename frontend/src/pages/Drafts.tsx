import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Camera,
  CheckSquare,
  MapPin,
  Search,
  Sparkles,
  Square,
  Thermometer,
  Trash2,
  Wind,
  Zap,
} from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { pelletTestApi, PelletTestSessionSummary } from '../api/pelletTesting'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../store/toast'

type DraftKind = 'pellet' | 'score'
type DraftStatus = 'needs-photo' | 'needs-measurement' | 'ready'
type FilterKey = 'all' | 'pellet' | 'score' | 'personal' | 'league'

interface MetaItem {
  icon: typeof MapPin
  text: string
}

interface DraftRow {
  id: string
  kind: DraftKind
  scope: 'personal' | 'league'
  title: string
  titleHighlight?: string
  searchHaystack: string
  meta: MetaItem[]
  when: string
  thumbnail?: string
  status: DraftStatus
  href: string
}

const STATUS_LABEL: Record<DraftStatus, string> = {
  'needs-photo': 'Needs photo',
  'needs-measurement': 'Needs measurement',
  ready: 'Ready',
}

const STATUS_FILL: Record<DraftStatus, number> = {
  'needs-photo': 2,
  'needs-measurement': 5,
  ready: 7,
}

function rowKey(row: DraftRow): string {
  return `${row.kind}-${row.id}`
}

function relative(iso: string): string {
  const d = new Date(iso)
  const secs = (Date.now() - d.getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function dayLabel(iso: string): { key: string; label: string } {
  const d = new Date(iso)
  const key = d.toISOString().slice(0, 10)
  const label = d
    .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase()
  return { key, label }
}

function distanceLabel(m: number, unit: string): string | null {
  if (!m || m <= 0) return null
  if (unit === 'yards') {
    const yd = m / 0.9144
    return `${Math.round(yd)}yd`
  }
  return `${Math.round(m)}m`
}

function pelletStatus(s: PelletTestSessionSummary): DraftStatus {
  if (!s.first_image_url) return 'needs-photo'
  if (!s.group_count || s.group_count === 0) return 'needs-measurement'
  return 'ready'
}

function scoreStatus(s: ScoreCardSummary): DraftStatus {
  if (!s.card_image_url) return 'needs-photo'
  return 'ready'
}

function toPelletRow(s: PelletTestSessionSummary): DraftRow {
  const meta: MetaItem[] = []
  const dist = distanceLabel(s.distance_m, s.distance_unit)
  if (dist) meta.push({ icon: MapPin, text: dist })
  meta.push({ icon: MapPin, text: s.location ?? 'No location' })
  if (s.wind_mph != null) meta.push({ icon: Wind, text: `${Math.round(s.wind_mph)} mph` })
  if (s.temp_celsius != null) meta.push({ icon: Thermometer, text: `${Math.round(s.temp_celsius)}°C` })
  return {
    id: s.id,
    kind: 'pellet',
    scope: 'personal',
    title: `${s.rifle_make} ${s.rifle_model}`,
    titleHighlight: `${s.pellet_brand} ${s.pellet_model}`,
    searchHaystack: `${s.rifle_make} ${s.rifle_model} ${s.pellet_brand} ${s.pellet_model} ${s.location ?? ''}`.toLowerCase(),
    meta,
    when: s.created_at,
    thumbnail: s.first_image_url ?? undefined,
    status: pelletStatus(s),
    href: `/pellet-testing/new?draftId=${s.id}`,
  }
}

function toScoreRow(s: ScoreCardSummary): DraftRow {
  const meta: MetaItem[] = []
  if (s.location) meta.push({ icon: MapPin, text: s.location })
  return {
    id: s.id,
    kind: 'score',
    scope: s.league_name ? 'league' : 'personal',
    title: s.league_name ? `League: ${s.league_name}` : 'Personal score card',
    searchHaystack: `${s.league_name ?? ''} ${s.location ?? ''}`.toLowerCase(),
    meta,
    when: s.created_at,
    thumbnail: s.card_image_url ?? undefined,
    status: scoreStatus(s),
    href: `/scores/new?draftId=${s.id}`,
  }
}

export default function Drafts() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<DraftRow[] | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')

  const { data: scoreDrafts, isLoading: scoresLoading } = useQuery({
    queryKey: ['score-drafts'],
    queryFn: () => scoreCardApi.list(50, 0, 'drafts'),
  })
  const { data: pelletDrafts, isLoading: pelletsLoading } = useQuery({
    queryKey: ['pellet-drafts'],
    queryFn: () => pelletTestApi.list(50, 0, 'drafts'),
  })
  const isLoading = scoresLoading || pelletsLoading

  const allRows = useMemo<DraftRow[]>(() => {
    return [
      ...(pelletDrafts?.items ?? []).map(toPelletRow),
      ...(scoreDrafts?.items ?? []).map(toScoreRow),
    ].sort((a, b) => (a.when < b.when ? 1 : -1))
  }, [pelletDrafts, scoreDrafts])

  const counts = useMemo(() => ({
    all: allRows.length,
    pellet: allRows.filter(r => r.kind === 'pellet').length,
    score: allRows.filter(r => r.kind === 'score').length,
    personal: allRows.filter(r => r.scope === 'personal').length,
    league: allRows.filter(r => r.scope === 'league').length,
  }), [allRows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows.filter(row => {
      if (filter === 'pellet' && row.kind !== 'pellet') return false
      if (filter === 'score' && row.kind !== 'score') return false
      if (filter === 'personal' && row.scope !== 'personal') return false
      if (filter === 'league' && row.scope !== 'league') return false
      if (q && !row.searchHaystack.includes(q)) return false
      return true
    })
  }, [allRows, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; rows: DraftRow[] }>()
    for (const row of filteredRows) {
      const { key, label } = dayLabel(row.when)
      if (!map.has(key)) map.set(key, { label, rows: [] })
      map.get(key)!.rows.push(row)
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }))
  }, [filteredRows])

  const selectedRows = filteredRows.filter(row => selected.has(rowKey(row)))
  const allSelected = filteredRows.length > 0 && selectedRows.length === filteredRows.length

  function toggleSelected(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filteredRows.map(rowKey)))
  }

  const deleteMutation = useMutation({
    mutationFn: async (drafts: DraftRow[]) => {
      await Promise.all(drafts.map(row =>
        row.kind === 'score'
          ? scoreCardApi.remove(row.id)
          : pelletTestApi.delete(row.id)
      ))
      return drafts.length
    },
    onSuccess: (count) => {
      setSelected(new Set())
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['score-drafts'] })
      qc.invalidateQueries({ queryKey: ['score-drafts-count'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts-count'] })
      toast(count === 1 ? 'Draft deleted' : `${count} drafts deleted`, 'success')
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : 'Failed to delete drafts', 'error')
    },
  })

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'pellet', label: 'Pellet tests', count: counts.pellet },
    { key: 'score', label: 'Score cards', count: counts.score },
    { key: 'personal', label: 'Personal', count: counts.personal },
    { key: 'league', label: 'League', count: counts.league },
  ]

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-medium tracking-widest uppercase text-secondary">Drafts</h1>
        <p className="text-sm text-muted max-w-2xl">
          Quick-captured entries waiting for shot scores, measurements, or final details. Refine them when you're back from the range.
        </p>
      </header>

      {allRows.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-subtle bg-surface p-8 text-center space-y-3">
          <p className="text-muted text-sm">No drafts yet.</p>
          <Link
            to="/quick-capture"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--brass)] text-inverse text-sm font-medium"
          >
            <Zap size={14} /> Start a quick capture
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted hover:text-secondary transition-colors"
              >
                {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              {selectedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(selectedRows)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--error-text)]/30 text-[var(--error-text)] text-xs tracking-widest uppercase hover:bg-[var(--error-bg)] transition-colors"
                >
                  <Trash2 size={13} />
                  Delete selected
                </button>
              )}
            </div>

            <div role="tablist" className="inline-flex items-center gap-1 p-1 rounded-full border border-subtle bg-surface overflow-x-auto">
              {filterTabs.map(tab => {
                const active = filter === tab.key
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.key)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-wide transition-colors ${
                      active
                        ? 'bg-[var(--text-primary)] text-inverse'
                        : 'text-muted hover:text-secondary'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] ${active ? 'opacity-80' : 'text-muted'}`}>{tab.count}</span>
                  </button>
                )
              })}
            </div>

            <div className="relative lg:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search rifle or pellet…"
                className="w-full pl-8 pr-3 py-2 rounded-full border border-subtle bg-surface text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
              />
            </div>
          </div>

          {isLoading && allRows.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg border border-subtle bg-surface animate-pulse" />
              ))}
            </div>
          )}

          {filteredRows.length === 0 && !isLoading && (
            <div className="rounded-lg border border-subtle bg-surface p-6 text-center text-sm text-muted">
              No drafts match this filter.
            </div>
          )}

          <div className="space-y-6">
            {grouped.map(group => (
              <section key={group.key} className="space-y-2">
                <div className="flex items-baseline justify-between border-b border-subtle pb-1">
                  <h2 className="text-[11px] tracking-widest uppercase text-muted">{group.label}</h2>
                  <span className="text-[11px] tracking-widest uppercase text-muted">
                    {group.rows.length} draft{group.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.rows.map(row => (
                    <li key={rowKey(row)}>
                      <DraftCard
                        row={row}
                        selected={selected.has(rowKey(row))}
                        onToggle={() => toggleSelected(rowKey(row))}
                        onDelete={() => setPendingDelete([row])}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete && pendingDelete.length > 1 ? 'Delete drafts?' : 'Delete draft?'}
        message={pendingDelete && pendingDelete.length > 1
          ? `This will permanently delete ${pendingDelete.length} selected drafts. This cannot be undone.`
          : 'This draft will be permanently deleted. This cannot be undone.'}
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => {
          if (pendingDelete && !deleteMutation.isPending) {
            deleteMutation.mutate(pendingDelete)
          }
        }}
        onCancel={() => {
          if (!deleteMutation.isPending) setPendingDelete(null)
        }}
      />
    </div>
  )
}

function DraftCard({
  row,
  selected,
  onToggle,
  onDelete,
}: {
  row: DraftRow
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const fill = STATUS_FILL[row.status]
  return (
    <div className="flex items-stretch gap-3 p-3 rounded-lg border border-subtle bg-surface hover:border-[var(--brass)]/40 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 self-center text-muted hover:text-secondary transition-colors"
        aria-label={selected ? 'Deselect draft' : 'Select draft'}
      >
        {selected ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>

      <div className="shrink-0 w-16 h-16 rounded bg-surface-hover overflow-hidden flex flex-col items-center justify-center text-muted">
        {row.thumbnail ? (
          <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <>
            <Camera size={18} />
            <span className="text-[9px] tracking-widest uppercase mt-0.5">No photo</span>
          </>
        )}
      </div>

      <Link to={row.href} className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] tracking-widest uppercase">
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            Draft
          </span>
          <span className="text-muted">{row.kind === 'pellet' ? 'Pellet test' : 'Score card'}</span>
          <span className={`px-1.5 py-0.5 rounded border ${
            row.scope === 'league'
              ? 'bg-[var(--brass-pill-bg)] text-[var(--brass)] border-[var(--brass)]/30'
              : 'text-muted border-subtle'
          }`}>
            {row.scope === 'league' ? 'League' : 'Personal'}
          </span>
          <span className="text-muted">· {relative(row.when)}</span>
        </div>
        <div className="text-sm lg:text-base text-primary font-medium tracking-wide truncate">
          {row.title}
          {row.titleHighlight && (
            <>
              <span className="text-muted mx-1.5">×</span>
              <span>{row.titleHighlight}</span>
            </>
          )}
        </div>
        {row.meta.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {row.meta.map((item, i) => {
              const Icon = item.icon
              return (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="opacity-60">·</span>}
                  <Icon size={11} className="opacity-70" />
                  {item.text}
                </span>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-0.5 flex-1 max-w-[260px]" aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-sm"
                style={{ backgroundColor: i < fill ? 'var(--brass)' : 'var(--brass-dim)' }}
              />
            ))}
          </div>
          <span className={`text-[11px] tracking-wide ${
            row.status === 'ready' ? 'text-[var(--brass)]' : 'text-muted'
          }`}>
            {STATUS_LABEL[row.status]}
          </span>
        </div>
      </Link>

      <div className="shrink-0 self-center flex items-center gap-1">
        <Link
          to={row.href}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--brass)]/40 text-[var(--brass)] text-xs tracking-wide hover:bg-[var(--brass-pill-bg)] transition-colors"
        >
          <Sparkles size={13} />
          Refine
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-2 text-muted hover:text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors"
          aria-label="Delete draft"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

