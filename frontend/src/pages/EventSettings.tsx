import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { eventsApi, type EventVisibility } from '../api/events'
import { toast } from '../store/toast'

export default function EventSettings() {
  const { slug } = useParams({ from: '/app/events/$slug/settings' })
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

  if (ev.isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (!ev.data) return <p className="p-6 text-sm text-red-600">Event not found.</p>
  if (!ev.data.is_owner) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm text-secondary mb-3">Owner-only page.</p>
        <Link to="/events/$slug" params={{ slug }} className="text-blue-600 hover:underline text-sm">
          Back to event
        </Link>
      </div>
    )
  }

  function onAddScorer(e: FormEvent) {
    e.preventDefault()
    if (!scorerUserId.trim()) return
    addScorer.mutate(scorerUserId.trim())
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-1">Event settings</h1>
      <p className="text-sm text-muted mb-5">{ev.data.name}</p>

      <section className="mb-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-secondary mb-2">
          Visibility
        </h2>
        <div className="flex gap-2">
          {(['public', 'club_only', 'unlisted'] as EventVisibility[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => updateVisibility.mutate(v)}
              disabled={updateVisibility.isPending}
              className={`px-3 py-1.5 rounded-md border text-sm flex-1 ${
                ev.data.visibility === v
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-subtle'
              }`}
            >
              {v === 'public' ? 'Public' : v === 'club_only' ? 'Club only' : 'Unlisted'}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-secondary mb-2">
          Delegated scorers
        </h2>
        <p className="text-xs text-muted mb-2">
          Grant another user permission to record scores for this event. You always have scoring rights as the owner.
        </p>
        <form onSubmit={onAddScorer} className="flex gap-2">
          <input
            value={scorerUserId}
            onChange={(e) => setScorerUserId(e.target.value)}
            placeholder="User ID (UUID)"
            className="flex-1 rounded-md border border-subtle bg-card px-3 py-2 text-sm font-mono"
          />
          <button
            type="submit"
            disabled={addScorer.isPending || !scorerUserId.trim()}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-white text-sm disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </section>

      <Link to="/events/$slug" params={{ slug }} className="text-blue-600 hover:underline text-sm">
        ← Back to event
      </Link>
    </div>
  )
}
