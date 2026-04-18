import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ApiError } from '../api/client'
import { supportTicketsApi } from '../api/supportTickets'
import { formatDateTime, useRegionalPrefs } from '../utils/date'

export default function SupportTicketDetail() {
  const { id } = useParams({ from: '/app/support/tickets/$id' })
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const ticketQuery = useQuery({
    queryKey: ['support-ticket', 'mine', id],
    queryFn: () => supportTicketsApi.getMine(id),
  })

  const markReadMutation = useMutation({
    mutationFn: () => supportTicketsApi.markRead(id),
  })

  const addMessageMutation = useMutation({
    mutationFn: () => supportTicketsApi.addMessage(id, replyBody.trim()),
    onSuccess: () => {
      setReplyBody('')
      setSubmitMessage('Reply sent.')
      markReadMutation.mutate()
      queryClient.invalidateQueries({ queryKey: ['support-ticket', 'mine', id] })
      queryClient.invalidateQueries({ queryKey: ['support-tickets', 'mine'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to send reply.'
      setSubmitMessage(msg)
    },
  })

  const timelineEntries = useMemo(() => {
    const detail = ticketQuery.data
    if (!detail) return []
    const messages = detail.messages.map((message) => ({
      id: `m-${message.id}`,
      kind: message.internal_note ? 'internal_note' : 'message',
      created_at: message.created_at,
      text: message.body,
      actor: message.author_id,
    }))
    const events = detail.events.map((event) => ({
      id: `e-${event.id}`,
      kind: event.event_type,
      created_at: event.created_at,
      text: [event.event_type, event.from_value && `from ${event.from_value}`, event.to_value && `to ${event.to_value}`].filter(Boolean).join(' · '),
      actor: event.actor_id,
    }))
    return [...messages, ...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }, [ticketQuery.data])

  function onSubmitReply(e: FormEvent) {
    e.preventDefault()
    setSubmitMessage(null)
    if (!replyBody.trim()) {
      setSubmitMessage('Reply cannot be empty.')
      return
    }
    addMessageMutation.mutate()
  }

  const detail = ticketQuery.data

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Support ticket detail</h1>
        <Link to="/support" className="text-sm text-[var(--brass)] hover:underline">Back to support center</Link>
      </div>

      {ticketQuery.isLoading && <p className="text-sm text-muted">Loading ticket…</p>}
      {ticketQuery.isError && <p role="alert" className="text-sm text-[var(--error-text)]">Failed to load ticket.</p>}

      {detail && (
        <>
          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6 space-y-2">
            <h2 className="text-xl font-medium">{detail.ticket.title ?? 'Untitled ticket'}</h2>
            <p className="text-xs text-muted">
              {detail.ticket.status ?? 'open'} · {detail.ticket.category ?? 'issue'} · {detail.ticket.priority ?? 'normal'}
            </p>
            <p className="text-xs text-muted">
              Created {formatDateTime(detail.ticket.created_at, prefs)} · Updated {formatDateTime(detail.ticket.updated_at, prefs)}
            </p>
            {detail.ticket.description && <p className="text-sm text-secondary whitespace-pre-wrap">{detail.ticket.description}</p>}
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
            <h3 className="font-medium">Message thread</h3>
            <div className="mt-3 space-y-2">
              {detail.messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
              {detail.messages.map((message) => (
                <article key={message.id} className="rounded-lg border border-subtle p-3 space-y-1">
                  <p className="text-xs text-muted">{message.author_id} · {formatDateTime(message.created_at, prefs)}</p>
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
              <h3 className="font-medium">Timeline</h3>
              <div className="mt-3 space-y-2">
                {timelineEntries.length === 0 && <p className="text-sm text-muted">No timeline events yet.</p>}
                {timelineEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-subtle px-3 py-2">
                    <p className="text-xs text-muted">{formatDateTime(entry.created_at, prefs)} · {entry.actor ?? 'system'}</p>
                    <p className="text-sm">{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
              <h3 className="font-medium">Participants</h3>
              <div className="mt-3 space-y-2">
                {detail.participants.length === 0 && <p className="text-sm text-muted">No participants available.</p>}
                {detail.participants.map((participant) => (
                  <div key={`${participant.user_id}-${participant.role}`} className="rounded-md border border-subtle px-3 py-2 text-sm">
                    <p>{participant.user_id}</p>
                    <p className="text-xs text-muted">{participant.role} · unread: {participant.unread_count ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
            <h3 className="font-medium">Reply</h3>
            <form className="mt-3 space-y-3" onSubmit={onSubmitReply}>
              <textarea
                className="min-h-28 w-full rounded-md border border-subtle bg-transparent p-2"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
              />
              <div className="flex items-center gap-3">
                <button type="submit" className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50" disabled={addMessageMutation.isPending}>
                  {addMessageMutation.isPending ? 'Sending…' : 'Send reply'}
                </button>
                {submitMessage && <p className="text-xs text-muted">{submitMessage}</p>}
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  )
}
