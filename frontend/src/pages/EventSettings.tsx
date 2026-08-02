import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ChevronLeft, Search, Trash2 } from 'lucide-react'
import { eventsApi, type EventVisibility, type UpdateEventPayload } from '../api/events'
import { eventInvitationsApi } from '../api/eventInvitations'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, PageHeader, Section, LoadingRows } from '../components/leagues'
import { toast } from '../store/toast'

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

function toggleCls(active: boolean) {
  return `flex-1 px-3 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors ${
    active
      ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]'
      : 'border-subtle text-muted hover:text-secondary'
  }`
}

/** ISO timestamp → value accepted by <input type="datetime-local">. */
function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EventSettings() {
  const { slug } = useParams({ from: '/app/events/$slug/settings' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const ev = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })

  const updateVisibility = useMutation({
    mutationFn: (visibility: EventVisibility) => eventsApi.update(slug, { visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      toast('Visibility updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Update failed', 'error'),
  })

  if (ev.isLoading) {
    return (
      <PageGrid>
        <Section title="Event Settings"><LoadingRows rows={5} /></Section>
      </PageGrid>
    )
  }
  if (!ev.data) {
    return (
      <PageGrid>
        <p style={{ padding: 24, fontSize: 13, color: 'var(--red)' }}>Event not found.</p>
      </PageGrid>
    )
  }
  if (!ev.data.is_owner) {
    return (
      <PageGrid>
        <Section title="Owner only">
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              This page is only available to the event owner.
            </p>
            <Link to="/events/$slug" params={{ slug }} className="lc-action-ghost">
              <ChevronLeft size={14} /> Back to event
            </Link>
          </div>
        </Section>
      </PageGrid>
    )
  }

  return (
    <PageGrid>
      <PageHeader
        title="Event settings"
        info={<HelpIcon content={pageHelp.eventSettings} />}
        description={ev.data.name}
        action={
          <button
            type="button"
            onClick={() => navigate({ to: '/events/$slug', params: { slug } })}
            className="lc-action-ghost"
          >
            <ChevronLeft size={14} /> Back
          </button>
        }
      />

      <div className="lc-stack">
        <DetailsSection
          slug={slug}
          name={ev.data.name}
          description={ev.data.description ?? ''}
          location={ev.data.location ?? ''}
          startsAt={ev.data.starts_at}
          endsAt={ev.data.ends_at}
          maxParticipants={ev.data.max_participants}
          participantCount={ev.data.participant_count}
        />

        <Section title="Visibility">
          <div style={{ padding: 18 }}>
            <div className="flex gap-2">
              {(['public', 'club_only', 'unlisted'] as EventVisibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateVisibility.mutate(v)}
                  disabled={updateVisibility.isPending}
                  className={toggleCls(ev.data.visibility === v)}
                >
                  {v === 'public' ? 'Public' : v === 'club_only' ? 'Club only' : 'Unlisted'}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <ScorersSection slug={slug} />
      </div>
    </PageGrid>
  )
}

function DetailsSection({
  slug,
  name,
  description,
  location,
  startsAt,
  endsAt,
  maxParticipants,
  participantCount,
}: {
  slug: string
  name: string
  description: string
  location: string
  startsAt?: string
  endsAt?: string
  maxParticipants?: number
  participantCount: number
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name,
    description,
    location,
    startsAt: toLocalInput(startsAt),
    endsAt: toLocalInput(endsAt),
    maxParticipants: maxParticipants ? String(maxParticipants) : '',
  })

  const save = useMutation({
    mutationFn: () => {
      const payload: UpdateEventPayload = {}
      if (form.name.trim() && form.name.trim() !== name) payload.name = form.name.trim()
      if (form.description.trim() !== description) payload.description = form.description.trim()
      if (form.location.trim() !== location) payload.location = form.location.trim()
      if (form.startsAt && form.startsAt !== toLocalInput(startsAt)) {
        payload.starts_at = new Date(form.startsAt).toISOString()
      }
      if (form.endsAt && form.endsAt !== toLocalInput(endsAt)) {
        payload.ends_at = new Date(form.endsAt).toISOString()
      }
      const capInput = form.maxParticipants.trim()
      const currentCap = maxParticipants ? String(maxParticipants) : ''
      if (capInput !== currentCap) {
        payload.max_participants = capInput ? Number.parseInt(capInput, 10) : 0
      }
      return eventsApi.update(slug, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast('Event updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Update failed', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    save.mutate()
  }

  return (
    <Section title="Details">
      <form onSubmit={onSubmit} className="space-y-3" style={{ padding: 18 }}>
        <label className="block">
          <span className="t-section-title block mb-1.5">Name</span>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="t-section-title block mb-1.5">Description</span>
          <textarea
            rows={2}
            className={`${inputCls} resize-none`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="t-section-title block mb-1.5">Location</span>
          <input
            className={inputCls}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="t-section-title block mb-1.5">Starts</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="t-section-title block mb-1.5">Ends</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={form.endsAt}
              min={form.startsAt || undefined}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </label>
        </div>
        <label className="block">
          <span className="t-section-title block mb-1.5">Max participants</span>
          <input
            type="number"
            min={Math.max(1, participantCount)}
            max={5000}
            placeholder="No limit"
            className={inputCls}
            value={form.maxParticipants}
            onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })}
          />
          <span className="block mt-1 text-xs text-muted">
            {participantCount > 0
              ? `Cannot be set below the current ${participantCount} participant${participantCount === 1 ? '' : 's'}. Clear the field to remove the limit.`
              : 'Leave empty for no limit.'}
          </span>
        </label>
        <button
          type="submit"
          disabled={save.isPending || !form.name.trim()}
          className="btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-5 py-3 rounded transition-all"
        >
          {save.isPending ? 'Saving…' : 'Save details'}
        </button>
      </form>
    </Section>
  )
}

function ScorersSection({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(id)
  }, [query])

  const scorers = useQuery({
    queryKey: ['event-scorers', slug],
    queryFn: () => eventsApi.listScorers(slug),
  })

  const search = useQuery({
    queryKey: ['event-scorer-search', slug, debounced],
    queryFn: () =>
      eventInvitationsApi.listPotentialInvitees(slug, { source: 'search', q: debounced, limit: 8 }),
    enabled: debounced.length >= 2,
  })

  const add = useMutation({
    mutationFn: (userId: string) => eventsApi.addScorer(slug, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-scorers', slug] })
      setQuery('')
      toast('Scorer added', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add scorer', 'error'),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => eventsApi.removeScorer(slug, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-scorers', slug] })
      toast('Scorer removed', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to remove scorer', 'error'),
  })

  const scorerIds = new Set((scorers.data?.items ?? []).map((s) => s.user_id))
  const results = (search.data?.items ?? []).filter((u) => !scorerIds.has(u.user_id))

  return (
    <Section title="Delegated scorers">
      <div style={{ padding: 18 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          Grant other users permission to record scores for this event. You always have scoring
          rights as the owner.
        </p>

        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name…"
            className={`${inputCls} pl-9`}
          />
        </div>

        {search.isFetching && debounced.length >= 2 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Searching…</p>
        )}
        {results.length > 0 && (
          <ul className="mb-3 border border-subtle rounded divide-y divide-[var(--line)]">
            {results.map((u) => (
              <li key={u.user_id} className="flex items-center gap-2 px-3 py-2">
                <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                  {u.display_name}
                </span>
                <button
                  type="button"
                  onClick={() => add.mutate(u.user_id)}
                  disabled={add.isPending}
                  className="lc-action-ghost"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
        {debounced.length >= 2 && !search.isFetching && results.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>No users found.</p>
        )}

        {scorers.isLoading && <LoadingRows rows={2} />}
        {!scorers.isLoading && (scorers.data?.items ?? []).length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>No delegated scorers yet.</p>
        )}
        {(scorers.data?.items ?? []).length > 0 && (
          <ul className="border border-subtle rounded divide-y divide-[var(--line)]">
            {(scorers.data?.items ?? []).map((s) => (
              <li key={s.user_id} className="flex items-center gap-2 px-3 py-2">
                <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                  {s.display_name || s.user_id}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(s.user_id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${s.display_name || 'scorer'}`}
                  className="lc-icon-btn"
                  style={{ color: 'var(--red)' }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
