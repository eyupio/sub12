import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { eventsApi, type EventVisibility } from '../api/events'
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

export default function EventSettings() {
  const { slug } = useParams({ from: '/app/events/$slug/settings' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scorerUserId, setScorerUserId] = useState('')

  const ev = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })

  const updateVisibility = useMutation({
    mutationFn: (visibility: EventVisibility) => eventsApi.update(slug, { visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      toast('Visibility updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Update failed', 'error'),
  })

  const addScorer = useMutation({
    mutationFn: (userId: string) => eventsApi.addScorer(slug, userId),
    onSuccess: () => {
      toast('Scorer added', 'success')
      setScorerUserId('')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add scorer', 'error'),
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

  function onAddScorer(e: FormEvent) {
    e.preventDefault()
    if (!scorerUserId.trim()) return
    addScorer.mutate(scorerUserId.trim())
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

        <Section title="Delegated scorers">
          <div style={{ padding: 18 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
              Grant another user permission to record scores for this event. You always have scoring rights as the owner.
            </p>
            <form onSubmit={onAddScorer} className="flex gap-2">
              <input
                value={scorerUserId}
                onChange={(e) => setScorerUserId(e.target.value)}
                placeholder="User ID (UUID)"
                className={`${inputCls} font-mono flex-1`}
              />
              <button
                type="submit"
                disabled={addScorer.isPending || !scorerUserId.trim()}
                className="btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-5 py-3 rounded transition-all"
              >
                Add
              </button>
            </form>
          </div>
        </Section>
      </div>
    </PageGrid>
  )
}
