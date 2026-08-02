import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CalendarClock, Check } from 'lucide-react'
import { eventsApi } from '../api/events'
import { scoreCardApi } from '../api/scoreCards'
import { ApiError } from '../api/client'
import { toast } from '../store/toast'

interface SubmitToEventDialogProps {
  open: boolean
  scoreCardId: string
  onClose: () => void
  onSuccess?: () => void
}

// Mirrors SubmitToLeagueDialog: pick one of your own live card-submission
// events and submit this card as your entry. Only events you've entered are
// offered — the backend refuses non-participants anyway.
export function SubmitToEventDialog({ open, scoreCardId, onClose, onSuccess }: SubmitToEventDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-events'],
    queryFn: () => eventsApi.listMine(),
    enabled: open,
  })
  const events = useMemo(
    () => (data?.items ?? []).filter((ev) => ev.state === 'live' && ev.format === 'card_submission'),
    [data]
  )

  useEffect(() => {
    if (!open) {
      setSelectedSlug(null)
      return
    }
    returnFocusRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  // Auto-select when there's exactly one live event.
  useEffect(() => {
    if (!open) return
    if (events.length === 1 && !selectedSlug) {
      setSelectedSlug(events[0].slug)
    }
  }, [open, events, selectedSlug])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const submitMutation = useMutation({
    mutationFn: (slug: string) => scoreCardApi.submitToEvent(scoreCardId, slug),
    onSuccess: () => {
      toast('Score card submitted to event', 'success')
      onSuccess?.()
      onClose()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Failed to submit to event', 'error')
      }
    },
  })

  if (!open) return null

  const submitting = submitMutation.isPending
  const empty = !isLoading && events.length === 0

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-surface border border-subtle rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-event-title"
        aria-describedby="submit-event-desc"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--gold-tint)] flex items-center justify-center shrink-0">
            <CalendarClock size={18} className="text-brass" />
          </div>
          <div>
            <h3 id="submit-event-title" className="t-subsection-title">Submit to Event</h3>
            <p id="submit-event-desc" className="text-sm text-muted mt-1">
              Choose a live event to enter this score card into. Only card-submission events you've joined are shown.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Loading events">
            <div className="w-5 h-5 border-2 border-subtle border-t-[var(--brass)] rounded-full animate-spin" />
          </div>
        )}

        {empty && (
          <div className="rounded border border-subtle bg-surface-hover p-4 text-center space-y-2">
            <p className="text-sm text-secondary">None of your events are live and accepting cards right now.</p>
            <Link
              to="/events"
              onClick={onClose}
              className="inline-block text-sm text-brass hover:underline"
            >
              Browse events →
            </Link>
          </div>
        )}

        {!isLoading && events.length > 0 && (
          <div
            className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-2"
            role="radiogroup"
            aria-label="Your live events"
          >
            {events.map((ev) => {
              const selected = selectedSlug === ev.slug
              return (
                <button
                  key={ev.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedSlug(ev.slug)}
                  className={[
                    'w-full text-left rounded border px-3 py-2.5 transition-colors flex items-center gap-3',
                    selected
                      ? 'border-brass bg-[var(--gold-tint)]'
                      : 'border-subtle bg-surface hover:bg-surface-hover',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="t-subsection-title truncate">{ev.name}</div>
                    <div className="text-xs text-muted truncate mt-0.5">
                      {ev.discipline} · {ev.participant_count} entered
                    </div>
                  </div>
                  {selected && <Check size={16} className="text-brass shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          {!empty && (
            <button
              type="button"
              onClick={() => selectedSlug && submitMutation.mutate(selectedSlug)}
              disabled={!selectedSlug || submitting}
              className="px-4 py-2 rounded bg-brass text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
