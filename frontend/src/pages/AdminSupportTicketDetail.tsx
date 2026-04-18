import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ApiError } from '../api/client'
import { featureRequestsApi } from '../api/featureRequests'
import { supportTicketsApi, type SupportTicketStatus } from '../api/supportTickets'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { formatDateTime, useRegionalPrefs } from '../utils/date'

const ticketStatuses: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed']

function labelForUser(
  userId: string | undefined,
  ctx: { currentUserId?: string; requesterId?: string },
): string {
  if (!userId) return 'System'
  if (userId === ctx.currentUserId) return 'You'
  if (userId === ctx.requesterId) return 'Requester'
  return 'Support'
}

export default function AdminSupportTicketDetail() {
  const { id } = useParams({ from: '/app/admin/support/tickets/$id' })
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [replyBody, setReplyBody] = useState('')
  const [internalNote, setInternalNote] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const ticketQuery = useQuery({
    queryKey: ['support-ticket', 'admin', id],
    queryFn: () => supportTicketsApi.adminGet(id),
  })

  const addMessageMutation = useMutation({
    mutationFn: () => supportTicketsApi.adminAddMessage(id, replyBody.trim(), internalNote),
    onSuccess: () => {
      setReplyBody('')
      setInternalNote(false)
      setSubmitMessage('Message posted.')
      queryClient.invalidateQueries({ queryKey: ['support-ticket', 'admin', id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to send message.'
      setSubmitMessage(msg)
    },
  })

  const transitionStatusMutation = useMutation({
    mutationFn: (status: SupportTicketStatus) => supportTicketsApi.adminTransitionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-ticket', 'admin', id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] })
    },
  })

  const featureRequestsQuery = useQuery({
    queryKey: ['admin', 'feature-requests', 'all'],
    queryFn: () => featureRequestsApi.list({ limit: 100 }),
  })
  const linkedFeature = useMemo(
    () => featureRequestsQuery.data?.items.find((item) => item.ticket_id === id),
    [featureRequestsQuery.data?.items, id],
  )

  const [convertOpen, setConvertOpen] = useState(false)
  const [convertTitle, setConvertTitle] = useState('')
  const [convertDescription, setConvertDescription] = useState('')

  useEffect(() => {
    if (convertOpen && ticketQuery.data?.ticket) {
      setConvertTitle((prev) => prev || ticketQuery.data.ticket.title || '')
      setConvertDescription((prev) => prev || ticketQuery.data.ticket.description || '')
    }
  }, [convertOpen, ticketQuery.data?.ticket])

  const convertMutation = useMutation({
    mutationFn: () => featureRequestsApi.adminCreateFromTicket(id, {
      title: convertTitle.trim(),
      refined_description: convertDescription.trim(),
    }),
    onSuccess: () => {
      toast('Ticket converted to feature request', 'success')
      setConvertOpen(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-requests'] })
      queryClient.invalidateQueries({ queryKey: ['support-ticket', 'admin', id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to convert ticket.'
      toast(msg, 'error')
    },
  })

  function onSubmitConvert(e: FormEvent) {
    e.preventDefault()
    if (!convertTitle.trim()) {
      toast('Title is required', 'error')
      return
    }
    convertMutation.mutate()
  }

  const timelineEntries = useMemo(() => {
    const detail = ticketQuery.data
    if (!detail) return []
    const requesterId = detail.ticket.requester_id
    const messages = detail.messages.map((message) => ({
      id: `m-${message.id}`,
      created_at: message.created_at,
      label: message.internal_note ? 'Internal note' : 'Message',
      body: message.body,
      actor: labelForUser(message.author_id, { currentUserId, requesterId }),
    }))
    const events = detail.events.map((event) => ({
      id: `e-${event.id}`,
      created_at: event.created_at,
      label: event.event_type,
      body: [event.from_value && `from ${event.from_value}`, event.to_value && `to ${event.to_value}`].filter(Boolean).join(' · '),
      actor: labelForUser(event.actor_id, { currentUserId, requesterId }),
    }))
    return [...messages, ...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }, [ticketQuery.data, currentUserId])

  function onSubmitReply(e: FormEvent) {
    e.preventDefault()
    setSubmitMessage(null)
    if (!replyBody.trim()) {
      setSubmitMessage('Message cannot be empty.')
      return
    }
    addMessageMutation.mutate()
  }

  const detail = ticketQuery.data

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin ticket detail</h1>
        <Link to="/admin/support" className="text-sm text-[var(--brass)] hover:underline">Back to inbox</Link>
      </div>

      {ticketQuery.isLoading && <p className="text-sm text-muted">Loading ticket…</p>}
      {ticketQuery.isError && <p role="alert" className="text-sm text-[var(--error-text)]">Failed to load ticket.</p>}

      {detail && (
        <>
          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6 space-y-2">
            <h2 className="text-xl font-medium">{detail.ticket.title ?? 'Untitled ticket'}</h2>
            <p className="text-xs text-muted">
              {detail.ticket.category ?? 'issue'} · {detail.ticket.priority ?? 'normal'} · {detail.ticket.scope_type ?? 'platform'}
            </p>
            <p className="text-xs text-muted">
              {detail.ticket.assignee_id
                ? detail.ticket.assignee_id === currentUserId
                  ? 'Assigned to you'
                  : 'Assigned'
                : 'Unassigned'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Status</span>
              <select
                className="rounded-md border border-subtle bg-transparent px-2 py-1 text-xs"
                value={detail.ticket.status}
                disabled={transitionStatusMutation.isPending}
                onChange={(e) => transitionStatusMutation.mutate(e.target.value as SupportTicketStatus)}
              >
                {ticketStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            {detail.ticket.description && <p className="text-sm text-secondary whitespace-pre-wrap">{detail.ticket.description}</p>}

            <div className="pt-2 border-t border-subtle">
              {linkedFeature ? (
                <p className="text-sm">
                  <span className="text-muted">Linked feature:</span>{' '}
                  <Link
                    to="/admin/support"
                    hash={`feature-${linkedFeature.id}`}
                    className="text-[var(--brass)] hover:underline"
                  >
                    {linkedFeature.title}
                  </Link>{' '}
                  <span className="text-xs text-muted">· status: {linkedFeature.status}</span>
                </p>
              ) : convertOpen ? (
                <form onSubmit={onSubmitConvert} className="mt-2 space-y-2">
                  <p className="text-sm font-medium">Convert to feature request</p>
                  <input
                    className="w-full rounded-md border border-subtle bg-transparent p-2 text-sm"
                    value={convertTitle}
                    onChange={(e) => setConvertTitle(e.target.value)}
                    placeholder="Feature title"
                    required
                  />
                  <textarea
                    className="w-full rounded-md border border-subtle bg-transparent p-2 text-sm"
                    rows={4}
                    value={convertDescription}
                    onChange={(e) => setConvertDescription(e.target.value)}
                    placeholder="Refined description"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
                      disabled={convertMutation.isPending}
                    >
                      {convertMutation.isPending ? 'Converting…' : 'Create feature request'}
                    </button>
                    <button type="button" className="rounded-md border border-subtle px-3 py-2 text-sm" onClick={() => setConvertOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="rounded-md border border-subtle px-3 py-2 text-sm hover:bg-[color:var(--surface-muted)]"
                  onClick={() => setConvertOpen(true)}
                  disabled={featureRequestsQuery.isLoading}
                >
                  Convert to feature request
                </button>
              )}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
              <h3 className="font-medium">Message thread</h3>
              <div className="mt-3 space-y-2">
                {detail.messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
                {detail.messages.map((message) => (
                  <article key={message.id} className="rounded-lg border border-subtle p-3 space-y-1">
                    <p className="text-xs text-muted">{labelForUser(message.author_id, { currentUserId, requesterId: detail.ticket.requester_id })} · {formatDateTime(message.created_at, prefs)}</p>
                    {message.internal_note && <p className="text-[10px] uppercase tracking-widest text-muted">Internal note</p>}
                    <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
              <h3 className="font-medium">Timeline / participants</h3>
              <div className="mt-3 space-y-2">
                {timelineEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-subtle px-3 py-2 text-sm">
                    <p className="text-xs text-muted">{formatDateTime(entry.created_at, prefs)} · {entry.actor}</p>
                    <p>{entry.label}{entry.body ? ` · ${entry.body}` : ''}</p>
                  </div>
                ))}
                {timelineEntries.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
              </div>
              <div className="mt-4 space-y-2">
                {detail.participants.map((participant) => (
                  <div key={`${participant.user_id}-${participant.role}`} className="rounded-md border border-subtle px-3 py-2 text-sm">
                    <p>{labelForUser(participant.user_id, { currentUserId, requesterId: detail.ticket.requester_id })}</p>
                    <p className="text-xs text-muted">{participant.role} · unread: {participant.unread_count ?? 0}</p>
                  </div>
                ))}
                {detail.participants.length === 0 && <p className="text-sm text-muted">No participants listed.</p>}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
            <h3 className="font-medium">Reply composer</h3>
            <form className="mt-3 space-y-3" onSubmit={onSubmitReply}>
              <textarea
                className="min-h-28 w-full rounded-md border border-subtle bg-transparent p-2"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply or internal note..."
              />
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />
                Internal note (visible to admins only)
              </label>
              <div className="flex items-center gap-3">
                <button type="submit" className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50" disabled={addMessageMutation.isPending}>
                  {addMessageMutation.isPending ? 'Sending…' : 'Post message'}
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
