import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Trophy, Lock, Eye, Calendar } from 'lucide-react'
import { eventsApi, type EventDTO, type EventState } from '../api/events'

const FILTERS: { id: 'all' | EventState; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live now' },
  { id: 'open_for_entries', label: 'Open' },
  { id: 'complete', label: 'Completed' },
]

export default function Events() {
  const [filter, setFilter] = useState<'all' | EventState>('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', filter],
    queryFn: () => eventsApi.list(filter === 'all' ? {} : { state: filter as EventState }),
  })

  const items: EventDTO[] = useMemo(() => data?.items ?? [], [data])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Live Events</h1>
        <Link
          to="/events/new"
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-white text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> New event
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
              filter === f.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-card border-subtle text-secondary hover:border-blue-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-red-600">Failed to load events.</p>}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-subtle p-8 text-center text-muted">
          <Calendar className="mx-auto mb-2" size={28} />
          <p className="text-sm">No events yet.</p>
          <Link to="/events/new" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
            Create the first one
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((ev) => (
          <li key={ev.id}>
            <Link
              to="/events/$slug"
              params={{ slug: ev.slug }}
              className="block rounded-lg border border-subtle bg-card p-4 hover:border-blue-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium truncate">{ev.name}</h2>
                    <StateBadge state={ev.state} />
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {ev.discipline} · {ev.course.lanes} lanes · {ev.participant_count} participant
                    {ev.participant_count === 1 ? '' : 's'}
                  </p>
                  {ev.location && <p className="text-xs text-muted mt-0.5 truncate">{ev.location}</p>}
                </div>
                <div className="flex items-center gap-1 text-muted shrink-0">
                  {ev.visibility === 'club_only' && <Lock size={14} aria-label="Club only" />}
                  {ev.visibility === 'unlisted' && <Eye size={14} aria-label="Unlisted" />}
                  {ev.state === 'complete' && <Trophy size={14} aria-label="Complete" />}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StateBadge({ state }: { state: EventState }) {
  const map: Record<EventState, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
    open_for_entries: { label: 'Open', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    live: { label: 'Live', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 animate-pulse' },
    complete: { label: 'Complete', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    archived: { label: 'Archived', cls: 'bg-zinc-100 text-muted dark:bg-zinc-900 dark:text-muted' },
  }
  const { label, cls } = map[state]
  return <span className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
}
