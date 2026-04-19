import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ApiError } from '../api/client'
import { supportTicketsApi } from '../api/supportTickets'
import { useAuthStore } from '../store/auth'
import { formatDateTime, useRegionalPrefs } from '../utils/date'
import { ConfirmDialog } from '../components/ConfirmDialog'

function labelForMessageAuthor(authorId: string | undefined, currentUserId: string | undefined): string {
  if (!authorId) return 'System'
  if (authorId === currentUserId) return 'You'
  return 'Support'
}

export default function SupportTicketDetail() {
  const { id } = useParams({ from: '/app/support/tickets/$id' })
  const navigate = useNavigate()
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [replyBody, setReplyBody] = useState('')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editMessage, setEditMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ticketQuery = useQuery({
    queryKey: ['support-ticket', 'mine', id],
    queryFn: () => supportTicketsApi.getMine(id),
  })

  const markReadMutation = useMutation({
    mutationFn: () => supportTicketsApi.markRead(id),
  })

  const updateTicketMutation = useMutation({
    mutationFn: (payload: { title?: string; description?: string; status?: 'open' | 'closed' }) =>
      supportTicketsApi.updateMine(id, payload),
    onSuccess: () => {
      setEditMessage('Ticket updated.')
      queryClient.invalidateQueries({ queryKey: ['support-ticket', 'mine', id] })
      queryClient.invalidateQueries({ queryKey: ['support-tickets', 'mine'] })
      queryClient.invalidateQueries({ queryKey: ['tickets', 'unread-count'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to update ticket.'
      setEditMessage(msg)
    },
  })

  const deleteTicketMutation = useMutation({
    mutationFn: () => supportTicketsApi.deleteMine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets', 'mine'] })
      queryClient.invalidateQueries({ queryKey: ['tickets', 'unread-count'] })
      navigate({ to: '/support' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete ticket.'
      setEditMessage(msg)
    },
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

  useEffect(() => {
    if (!detail?.ticket) return
    setTitle(detail.ticket.title ?? '')
    setDescription(detail.ticket.description ?? '')
  }, [detail?.ticket])

  function onSaveTicketEdits(e: FormEvent) {
    e.preventDefault()
    setEditMessage(null)
    if (!title.trim()) {
      setEditMessage('Title cannot be empty.')
      return
    }
    if (!description.trim()) {
      setEditMessage('Description cannot be empty.')
      return
    }
    updateTicketMutation.mutate({ title: title.trim(), description: description.trim() })
  }

  function onToggleClosed() {
    if (!detail?.ticket?.status) return
    setEditMessage(null)
    const nextStatus = detail.ticket.status === 'closed' ? 'open' : 'closed'
    updateTicketMutation.mutate({ status: nextStatus })
  }

  function onDeleteTicket() {
    setEditMessage(null)
    setConfirmDelete(true)
  }

  function onConfirmDelete() {
    setConfirmDelete(false)
    deleteTicketMutation.mutate()
  }

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

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6 space-y-3">
            <h3 className="font-medium">Ticket controls</h3>
            <form className="space-y-3" onSubmit={onSaveTicketEdits}>
              <label className="block text-sm space-y-1">
                <span className="text-muted">Title</span>
                <input
                  className="w-full rounded-md border border-subtle bg-transparent px-3 py-2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="block text-sm space-y-1">
                <span className="text-muted">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-subtle bg-transparent p-2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
                  disabled={updateTicketMutation.isPending || deleteTicketMutation.isPending}
                >
                  {updateTicketMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-subtle px-3 py-2 text-sm disabled:opacity-50"
                  disabled={updateTicketMutation.isPending || deleteTicketMutation.isPending}
                  onClick={onToggleClosed}
                >
                  {detail.ticket.status === 'closed' ? 'Reopen ticket' : 'Close ticket'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--error-text)] px-3 py-2 text-sm text-[var(--error-text)] disabled:opacity-50"
                  disabled={updateTicketMutation.isPending || deleteTicketMutation.isPending}
                  onClick={onDeleteTicket}
                >
                  {deleteTicketMutation.isPending ? 'Deleting…' : 'Delete ticket'}
                </button>
                {editMessage && <p className="text-xs text-muted">{editMessage}</p>}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
            <h3 className="font-medium">Message thread</h3>
            <div className="mt-3 space-y-2">
              {detail.messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
              {detail.messages.map((message) => (
                <article key={message.id} className="rounded-lg border border-subtle p-3 space-y-1">
                  <p className="text-xs text-muted">{labelForMessageAuthor(message.author_id, currentUserId)} · {formatDateTime(message.created_at, prefs)}</p>
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                </article>
              ))}
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
      <ConfirmDialog
        open={confirmDelete}
        title="Delete ticket"
        message="Delete this ticket permanently? This action cannot be undone."
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
