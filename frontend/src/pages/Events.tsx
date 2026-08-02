import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Eye, Lock, Plus, Trophy, Users } from 'lucide-react'
import { eventsApi, type EventDTO, type EventState } from '../api/events'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import {
  Badge,
  EmptyState,
  EntityCard,
  type MetaItem,
  PageGrid,
  PageHeader,
} from '../components/leagues'
import { SkeletonCard } from '../components/Skeleton'
import { courseLabel, isEventFull, participantsLabel } from '../utils/eventDisplay'

const FILTERS: { id: 'all' | EventState; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live now' },
  { id: 'open_for_entries', label: 'Open' },
  { id: 'complete', label: 'Completed' },
]

function StateBadge({ state }: { state: EventState }) {
  switch (state) {
    case 'live':
      return <Badge variant="red" live>Live</Badge>
    case 'open_for_entries':
      return <Badge variant="green">Open</Badge>
    case 'complete':
      return <Badge variant="gold">Complete</Badge>
    case 'archived':
      return <Badge variant="neutral">Archived</Badge>
    case 'draft':
    default:
      return <Badge variant="neutral">Draft</Badge>
  }
}

export default function Events() {
  const [filter, setFilter] = useState<'all' | EventState>('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', filter],
    queryFn: () => eventsApi.list(filter === 'all' ? {} : { state: filter as EventState }),
  })

  const items: EventDTO[] = useMemo(() => data?.items ?? [], [data])

  return (
    <PageGrid>
      <PageHeader
        title="Live Events"
        info={<HelpIcon content={pageHelp.events} />}
        description="Browse, join, or run live shooting events. Open events accept entries; live events show a real-time scoreboard."
        action={
          <Link to="/events/new" className="lc-action-ghost">
            <Plus size={14} /> New
          </Link>
        }
      />

      <div className="lc-stack">
        <div className="lc-chips" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`lc-chip ${filter === f.id ? 'is-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="lc-stack" aria-busy>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>Failed to load events.</p>}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={<CalendarClock size={42} />}
            title="No events yet"
            body="Create the first one to get started."
            cta={
              <Link to="/events/new" className="lc-action-ghost">
                <Plus size={14} /> New event
              </Link>
            }
          />
        )}

        {items.length > 0 && (
          <div className="lc-stack">
            {items.map((ev) => {
              const badges = (
                <>
                  <StateBadge state={ev.state} />
                  {isEventFull(ev) && ev.state !== 'complete' && ev.state !== 'archived' && (
                    <Badge variant="red">Full</Badge>
                  )}
                  {ev.visibility === 'club_only' && (
                    <Badge variant="neutral">
                      <Lock size={10} /> Club only
                    </Badge>
                  )}
                  {ev.visibility === 'unlisted' && (
                    <Badge variant="neutral">
                      <Eye size={10} /> Unlisted
                    </Badge>
                  )}
                </>
              )
              const meta: MetaItem[] = [
                { icon: <Trophy size={12} />, text: ev.discipline },
                { icon: <CalendarClock size={12} />, text: courseLabel(ev) },
                { icon: <Users size={12} />, text: participantsLabel(ev) },
              ]
              if (ev.location) {
                meta.push({ text: ev.location })
              }
              return (
                <EntityCard
                  key={ev.id}
                  to="/events/$slug"
                  toParams={{ slug: ev.slug }}
                  thumbIcon={<CalendarClock size={24} />}
                  name={ev.name}
                  badges={badges}
                  meta={meta}
                  rightRail="chevron"
                />
              )
            })}
          </div>
        )}
      </div>
    </PageGrid>
  )
}
