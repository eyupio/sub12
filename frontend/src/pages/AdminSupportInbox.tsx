import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Inbox, Lightbulb, Pencil, Trash2, X } from 'lucide-react'
import { featureRequestsApi, type FeatureRequest, type FeatureRequestPriority, type FeatureRequestStatus } from '../api/featureRequests'
import { supportTicketsApi, type SupportTicketCategory, type SupportTicketStatus } from '../api/supportTickets'
import { toast } from '../store/toast'

const ticketStatuses: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed']
const featureStatuses: FeatureRequestStatus[] = ['submitted', 'refining', 'accepted', 'rejected', 'planned', 'in_progress', 'done', 'implemented']
const featurePriorities: FeatureRequestPriority[] = ['low', 'normal', 'high', 'urgent']

export default function AdminSupportInbox() {
  const qc = useQueryClient()
  const [ticketStatus, setTicketStatus] = useState<SupportTicketStatus>('open')
  const [ticketCategory, setTicketCategory] = useState<SupportTicketCategory | 'all'>('all')
  const [editingFeature, setEditingFeature] = useState<FeatureRequest | null>(null)
  const [deletingFeatureId, setDeletingFeatureId] = useState<string | null>(null)

  const ticketsQuery = useQuery({
    queryKey: ['admin', 'tickets', ticketStatus, ticketCategory],
    queryFn: () => supportTicketsApi.adminList({
      status: ticketStatus,
      category: ticketCategory === 'all' ? undefined : ticketCategory,
      limit: 100,
    }),
  })

  const featureRequestsQuery = useQuery({
    queryKey: ['admin', 'feature-requests', 'all'],
    queryFn: () => featureRequestsApi.list({ limit: 100 }),
  })

  const transitionStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupportTicketStatus }) => supportTicketsApi.adminTransitionStatus(id, status),
    onSuccess: () => {
      toast('Ticket status updated', 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'tickets'] })
    },
    onError: () => toast('Failed to update ticket status', 'error'),
  })

  const updateFeatureStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeatureRequestStatus }) => featureRequestsApi.adminUpdate(id, { status }),
    onSuccess: () => {
      toast('Feature request status updated', 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'feature-requests'] })
    },
    onError: () => toast('Failed to update feature request', 'error'),
  })

  const deleteFeatureMutation = useMutation({
    mutationFn: (id: string) => featureRequestsApi.adminDelete(id),
    onSuccess: () => {
      toast('Feature request deleted', 'success')
      setDeletingFeatureId(null)
      qc.invalidateQueries({ queryKey: ['admin', 'feature-requests'] })
    },
    onError: () => toast('Failed to delete feature request', 'error'),
  })

  const tickets = ticketsQuery.data?.items ?? []

  const sortedFeatureRequests = useMemo(
    () => [...(featureRequestsQuery.data?.items ?? [])].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [featureRequestsQuery.data?.items],
  )

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6">
      <h1 className="t-page-title">Admin support inbox</h1>
      <p className="text-sm text-muted">Triage tickets and maintain feature requests in one place.</p>

      <section className="rounded-xl border border-subtle bg-surface p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h2 className="t-subsection-title flex items-center gap-2"><Inbox size={16} className="text-[var(--brass)]" /> Submitted tickets</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-sm"
              value={ticketStatus}
              onChange={(e) => setTicketStatus(e.target.value as SupportTicketStatus)}
            >
              {ticketStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-sm"
              value={ticketCategory}
              onChange={(e) => setTicketCategory(e.target.value as SupportTicketCategory | 'all')}
            >
              <option value="all">all categories</option>
              <option value="question">question</option>
              <option value="issue">issue</option>
              <option value="feature">feature</option>
            </select>
          </div>
        </div>

        {ticketsQuery.isLoading && <p className="text-sm text-muted">Loading tickets…</p>}
        {ticketsQuery.isError && <p role="alert" className="text-[var(--error-text)] text-sm">Failed to load tickets.</p>}
        {!ticketsQuery.isLoading && tickets.length === 0 && <p className="text-sm text-muted">No tickets found.</p>}

        <ul className="space-y-2">
          {tickets.map(ticket => (
            <li key={ticket.id} className="rounded-lg border border-subtle p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="t-subsection-title">{ticket.title}</p>
                  <p className="text-xs text-muted">
                    {ticket.category} · {ticket.priority} · {ticket.scope_type} · {ticket.status}
                  </p>
                  <Link to="/admin/support/tickets/$id" params={{ id: ticket.id }} className="mt-1 inline-block text-xs text-[var(--brass)] hover:underline">
                    Open ticket
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  {transitionStatusMutation.isPending && transitionStatusMutation.variables?.id === ticket.id && (
                    <span className="text-xs text-muted">Updating…</span>
                  )}
                  <select
                    className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-xs"
                    value={ticket.status}
                    disabled={transitionStatusMutation.isPending}
                    onChange={(e) => transitionStatusMutation.mutate({ id: ticket.id, status: e.target.value as SupportTicketStatus })}
                  >
                    {ticketStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {ticket.description && <p className="text-sm text-secondary whitespace-pre-wrap">{ticket.description}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section id="feature-requests" className="rounded-xl border border-subtle bg-surface p-4 space-y-4">
        <h2 className="t-subsection-title flex items-center gap-2"><Lightbulb size={16} className="text-[var(--brass)]" /> Feature requests</h2>

        {featureRequestsQuery.isLoading && <p className="text-sm text-muted">Loading feature requests…</p>}
        {featureRequestsQuery.isError && <p role="alert" className="text-[var(--error-text)] text-sm">Failed to load feature requests.</p>}
        {!featureRequestsQuery.isLoading && sortedFeatureRequests.length === 0 && <p className="text-sm text-muted">No feature requests found.</p>}

        <ul className="space-y-2">
          {sortedFeatureRequests.map(feature => (
            <li key={feature.id} id={`feature-${feature.id}`} className="rounded-lg border border-subtle p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-subsection-title">{feature.title}</p>
                  <p className="text-xs text-muted">
                    {feature.scope_name ?? feature.scope_type} · {feature.priority} priority · Votes: {feature.vote_count} · Comments: {feature.comment_count}
                  </p>
                  <Link to="/feature-requests/$id" params={{ id: feature.id }} className="mt-1 inline-block text-xs text-[var(--brass)] hover:underline">
                    View on board
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-xs"
                    value={feature.status}
                    disabled={updateFeatureStatusMutation.isPending}
                    onChange={(e) => updateFeatureStatusMutation.mutate({ id: feature.id, status: e.target.value as FeatureRequestStatus })}
                  >
                    {featureStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {deletingFeatureId === feature.id ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md bg-[var(--error-text)] px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => deleteFeatureMutation.mutate(feature.id)}
                        disabled={deleteFeatureMutation.isPending}
                      >
                        {deleteFeatureMutation.isPending ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-subtle px-2 py-1.5 text-xs"
                        onClick={() => setDeletingFeatureId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1.5 text-xs hover:bg-[color:var(--surface-muted)]"
                        onClick={() => setEditingFeature(feature)}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1.5 text-xs text-[var(--error-text)] hover:bg-[color:var(--surface-muted)]"
                        onClick={() => setDeletingFeatureId(feature.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {feature.refined_description && <p className="text-sm text-secondary whitespace-pre-wrap">{feature.refined_description}</p>}
            </li>
          ))}
        </ul>
      </section>

      {editingFeature && (
        <FeatureRequestEditDialog
          feature={editingFeature}
          onClose={() => setEditingFeature(null)}
          onSaved={() => {
            setEditingFeature(null)
            qc.invalidateQueries({ queryKey: ['admin', 'feature-requests'] })
          }}
        />
      )}
    </div>
  )
}

interface FeatureRequestEditDialogProps {
  feature: FeatureRequest
  onClose: () => void
  onSaved: () => void
}

function FeatureRequestEditDialog({ feature, onClose, onSaved }: FeatureRequestEditDialogProps) {
  const [title, setTitle] = useState(feature.title)
  const [refinedDescription, setRefinedDescription] = useState(feature.refined_description)
  const [status, setStatus] = useState<FeatureRequestStatus>(feature.status)
  const [priority, setPriority] = useState<FeatureRequestPriority>(feature.priority)
  const [ownerAdminID, setOwnerAdminID] = useState(feature.owner_admin_id ?? '')

  const updateMutation = useMutation({
    mutationFn: () => featureRequestsApi.adminUpdate(feature.id, {
      title,
      refined_description: refinedDescription,
      status,
      priority,
      owner_admin_id: ownerAdminID.trim() === '' ? undefined : ownerAdminID.trim(),
    }),
    onSuccess: () => {
      toast('Feature request updated', 'success')
      onSaved()
    },
    onError: () => toast('Failed to update feature request', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit feature request">
      <div className="w-full max-w-lg rounded-2xl border border-subtle bg-surface p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="t-subsection-title">Edit feature request</h3>
          <button type="button" className="rounded-md p-1 hover:bg-[color:var(--surface-muted)]" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label className="block text-sm">
            Title
            <input
              className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Refined description
            <textarea
              className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
              rows={5}
              value={refinedDescription}
              onChange={(e) => setRefinedDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Status
            <select
              className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as FeatureRequestStatus)}
            >
              {featureStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Priority
            <select
              className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value as FeatureRequestPriority)}
            >
              {featurePriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Owner admin ID (optional)
            <input
              className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
              value={ownerAdminID}
              onChange={(e) => setOwnerAdminID(e.target.value)}
              placeholder="UUID"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="rounded-md border border-subtle px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
