import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ChevronRight, Plus, Share2, Trash2, UserPlus, Users } from 'lucide-react'
import { eventsApi, type EventState } from '../api/events'
import { categoriesApi } from '../api/categories'
import { toast } from '../store/toast'

export default function EventDetail() {
  const { slug } = useParams({ from: '/app/events/$slug' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showAddGuest, setShowAddGuest] = useState(false)

  const eventQuery = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const partsQuery = useQuery({
    queryKey: ['event-participants', slug],
    queryFn: () => eventsApi.listParticipants(slug),
  })
  const catsQuery = useQuery({ queryKey: ['categories', 'public'], queryFn: () => categoriesApi.listPublic() })

  const ev = eventQuery.data
  const participants = partsQuery.data?.items ?? []
  const categoryLookup = new Map((catsQuery.data?.items ?? []).map((c) => [c.id, c]))

  const promote = useMutation({
    mutationFn: (target: EventState) => eventsApi.promote(slug, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast('Event updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to promote', 'error'),
  })

  const join = useMutation({
    mutationFn: () => eventsApi.join(slug, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      toast('Joined event', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to join', 'error'),
  })

  const removeParticipant = useMutation({
    mutationFn: (participantId: string) => eventsApi.removeParticipant(slug, participantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-participants', slug] }),
  })

  function copyLink() {
    const url = `${window.location.origin}/events/${slug}`
    navigator.clipboard?.writeText(url).then(
      () => toast('Link copied', 'success'),
      () => toast('Could not copy link', 'error'),
    )
  }

  if (eventQuery.isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (eventQuery.error || !ev) return <p className="p-6 text-sm text-red-600">Failed to load event.</p>

  const nextState = nextStateFor(ev.state)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{ev.name}</h1>
        <p className="text-sm text-muted mt-1">
          {ev.discipline} · {ev.course.lanes} lanes · {ev.state}
        </p>
        {ev.location && <p className="text-sm text-muted">{ev.location}</p>}
        <p className="text-xs text-muted mt-1 font-mono">Event ID: {ev.slug}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {ev.is_scorer && (
          <Link
            to="/events/$slug/scorecard"
            params={{ slug: ev.slug }}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-white text-sm"
          >
            Open scorecard <ChevronRight size={14} />
          </Link>
        )}
        <Link
          to="/events/$slug/live"
          params={{ slug: ev.slug }}
          className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-hover"
        >
          Live scoreboard <ChevronRight size={14} />
        </Link>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 rounded-md border border-subtle px-3 py-1.5 text-sm"
        >
          <Share2 size={14} /> Share
        </button>
        {ev.is_owner && nextState && (
          <button
            type="button"
            onClick={() => promote.mutate(nextState)}
            disabled={promote.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950"
          >
            {promote.isPending ? 'Updating…' : labelFor(nextState)}
          </button>
        )}
        {ev.is_owner && (
          <button
            type="button"
            onClick={() => navigate({ to: '/events/$slug/settings', params: { slug: ev.slug } })}
            className="inline-flex items-center gap-1 rounded-md border border-subtle px-3 py-1.5 text-sm"
          >
            Settings
          </button>
        )}
      </div>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium uppercase tracking-wider text-secondary">
            <Users className="inline mr-1" size={14} /> Participants ({participants.length})
          </h2>
          <div className="flex gap-2">
            {!ev.is_owner && (ev.state === 'open_for_entries' || ev.state === 'live') && (
              <button
                type="button"
                onClick={() => join.mutate()}
                disabled={join.isPending}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <UserPlus size={14} /> Join
              </button>
            )}
            {ev.is_owner && (
              <button
                type="button"
                onClick={() => setShowAddGuest((v) => !v)}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <Plus size={14} /> Add guest
              </button>
            )}
          </div>
        </div>

        {showAddGuest && ev.is_owner && (
          <AddGuestForm
            slug={slug}
            categoryOptions={ev.category_ids
              .map((id) => categoryLookup.get(id))
              .filter((c): c is NonNullable<typeof c> => Boolean(c))}
            onAdded={() => {
              setShowAddGuest(false)
              queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
            }}
          />
        )}

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-subtle bg-card">
          {participants.length === 0 && (
            <li className="p-3 text-sm text-muted">No participants yet.</li>
          )}
          {participants.map((p) => {
            const cat = p.category_id ? categoryLookup.get(p.category_id) : undefined
            return (
              <li key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {p.display_name}
                    {!p.user_id && (
                      <span className="ml-2 text-[10px] uppercase rounded px-1 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Guest
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {[cat?.label, p.team, p.weapon_label].filter(Boolean).join(' · ') || ' '}
                  </p>
                </div>
                {ev.is_owner && (
                  <button
                    type="button"
                    onClick={() => removeParticipant.mutate(p.id)}
                    aria-label={`Remove ${p.display_name}`}
                    className="text-muted hover:text-red-600 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function AddGuestForm({
  slug,
  categoryOptions,
  onAdded,
}: {
  slug: string
  categoryOptions: { id: string; label: string }[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const add = useMutation({
    mutationFn: () =>
      eventsApi.addGuest(slug, {
        guest_name: name.trim(),
        team: team.trim() || undefined,
        category_id: categoryId || undefined,
      }),
    onSuccess: () => {
      toast('Guest added', 'success')
      setName('')
      setTeam('')
      setCategoryId('')
      onAdded()
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add guest', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    add.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-subtle bg-surface p-3 mb-3 space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Guest name"
        autoFocus
        className="w-full rounded-md border border-subtle bg-surface px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Team (optional)"
        className="w-full rounded-md border border-subtle bg-surface px-3 py-2 text-sm"
      />
      {categoryOptions.length > 0 && (
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border border-subtle bg-surface px-3 py-2 text-sm"
        >
          <option value="">Category (optional)</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={add.isPending || !name.trim()}
        className="rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-white text-sm disabled:opacity-50"
      >
        {add.isPending ? 'Adding…' : 'Add guest'}
      </button>
    </form>
  )
}

function nextStateFor(state: EventState): EventState | null {
  switch (state) {
    case 'draft':
      return 'open_for_entries'
    case 'open_for_entries':
      return 'live'
    case 'live':
      return 'complete'
    default:
      return null
  }
}

function labelFor(state: EventState): string {
  switch (state) {
    case 'open_for_entries':
      return 'Open for entries'
    case 'live':
      return 'Go live'
    case 'complete':
      return 'Mark complete'
    default:
      return state
  }
}
