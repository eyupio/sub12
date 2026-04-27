import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Download, RefreshCw } from 'lucide-react'
import { eventsApi } from '../api/events'
import { categoriesApi } from '../api/categories'

const REFRESH_INTERVAL_SECONDS = 30

export default function EventLive() {
  const { slug } = useParams({ from: '/app/events/$slug/live' })
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all')
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS)

  const ev = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const cats = useQuery({ queryKey: ['categories', 'public'], queryFn: () => categoriesApi.listPublic() })
  const board = useQuery({
    queryKey: ['event-scoreboard', slug],
    queryFn: () => eventsApi.scoreboard(slug),
    refetchInterval: REFRESH_INTERVAL_SECONDS * 1000,
    refetchOnWindowFocus: true,
  })

  const categoryLookup = useMemo(() => new Map((cats.data?.items ?? []).map((c) => [c.id, c])), [cats.data])

  // Reset countdown each time the scoreboard query refetches.
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_SECONDS)
  }, [board.dataUpdatedAt])

  // Tick the countdown (cosmetic only — actual refetch driven by refetchInterval).
  useEffect(() => {
    const id = window.setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_SECONDS : c - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const all = board.data?.items ?? []
    if (categoryFilter === 'all') return all
    return all.filter((r) => r.category_id === categoryFilter)
  }, [board.data, categoryFilter])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{ev.data?.name ?? 'Live scoreboard'}</h1>
          <p className="text-xs text-muted mt-1">
            {ev.data?.discipline} · auto-refresh in {countdown}s
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => board.refetch()}
            aria-label="Refresh"
            className="rounded-md border border-subtle p-2 hover:border-blue-500"
          >
            <RefreshCw size={16} className={board.isFetching ? 'animate-spin' : ''} />
          </button>
          <a
            href={eventsApi.resultsCsvUrl(slug)}
            className="rounded-md border border-subtle px-3 py-1.5 text-sm hover:border-blue-500 inline-flex items-center gap-1"
          >
            <Download size={14} /> CSV
          </a>
        </div>
      </div>

      {ev.data?.category_ids && ev.data.category_ids.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterChip
            label="All"
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          />
          {ev.data.category_ids.map((id) => {
            const c = categoryLookup.get(id)
            if (!c) return null
            return (
              <FilterChip
                key={id}
                label={c.label}
                active={categoryFilter === id}
                onClick={() => setCategoryFilter(id)}
              />
            )
          })}
        </div>
      )}

      {board.isLoading && <p className="text-sm text-muted">Loading scoreboard…</p>}
      {board.error && <p className="text-sm text-red-600">Failed to load scoreboard.</p>}

      {!board.isLoading && rows.length === 0 && (
        <p className="text-sm text-muted text-center py-8">No scores yet.</p>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-subtle bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-secondary">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Shooter</th>
                <th className="text-right px-3 py-2 w-16">Pts</th>
                <th className="text-right px-3 py-2 w-16">Hits</th>
                <th className="text-right px-3 py-2 w-16">Shots</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cat = r.category_id ? categoryLookup.get(r.category_id) : null
                return (
                  <tr key={r.participant_id} className="border-t border-subtle">
                    <td className="px-3 py-2 text-muted font-mono">{r.position}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.display_name}</div>
                      <div className="text-xs text-muted">
                        {[cat?.label, r.team].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.points}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.hit_count}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{r.shots_recorded}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs ${
        active
          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
          : 'border-subtle text-secondary'
      }`}
    >
      {label}
    </button>
  )
}
