import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Inbox, Lightbulb } from 'lucide-react'
import { featureRequestsApi } from '../api/featureRequests'
import { supportTicketsApi, type SupportTicketCategory, type SupportTicketStatus } from '../api/supportTickets'
import { toast } from '../store/toast'

const ticketStatuses: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed']

export default function AdminSupportInbox() {
  const qc = useQueryClient()
  const [ticketStatus, setTicketStatus] = useState<SupportTicketStatus>('open')
  const [ticketCategory, setTicketCategory] = useState<SupportTicketCategory | 'all'>('all')

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

  const tickets = ticketsQuery.data?.items ?? []

  const sortedFeatureRequests = useMemo(
    () => [...(featureRequestsQuery.data?.items ?? [])].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [featureRequestsQuery.data?.items],
  )

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Admin support inbox</h1>
      <p className="text-sm text-muted">View submitted support tickets and feature requests in one place.</p>

      <section className="rounded-xl border border-subtle bg-surface p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h2 className="font-medium flex items-center gap-2"><Inbox size={16} className="text-[var(--brass)]" /> Submitted tickets</h2>
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
                  <p className="font-medium">{ticket.title}</p>
                  <p className="text-xs text-muted">
                    {ticket.category} · {ticket.priority} · {ticket.scope_type} · {ticket.status}
                  </p>
                  <Link to="/admin/support/tickets/$id" params={{ id: ticket.id }} className="mt-1 inline-block text-xs text-[var(--brass)] hover:underline">
                    Open ticket
                  </Link>
                </div>
                <select
                  className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-xs"
                  value={ticket.status}
                  disabled={transitionStatusMutation.isPending}
                  onChange={(e) => transitionStatusMutation.mutate({ id: ticket.id, status: e.target.value as SupportTicketStatus })}
                >
                  {ticketStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {ticket.description && <p className="text-sm text-secondary whitespace-pre-wrap">{ticket.description}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-subtle bg-surface p-4 space-y-4">
        <h2 className="font-medium flex items-center gap-2"><Lightbulb size={16} className="text-[var(--brass)]" /> Feature requests</h2>

        {featureRequestsQuery.isLoading && <p className="text-sm text-muted">Loading feature requests…</p>}
        {featureRequestsQuery.isError && <p role="alert" className="text-[var(--error-text)] text-sm">Failed to load feature requests.</p>}
        {!featureRequestsQuery.isLoading && sortedFeatureRequests.length === 0 && <p className="text-sm text-muted">No feature requests found.</p>}

        <ul className="space-y-2">
          {sortedFeatureRequests.map(feature => (
            <li key={feature.id} className="rounded-lg border border-subtle p-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{feature.title}</p>
                <span className="text-xs text-muted">{feature.status}</span>
              </div>
              <p className="text-xs text-muted">Ticket: {feature.ticket_id} · Votes: {feature.vote_count}</p>
              {feature.refined_description && <p className="text-sm text-secondary whitespace-pre-wrap">{feature.refined_description}</p>}
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted">Need to refine statuses or ownership? Use the Feature Admin page.</p>
      </section>
    </div>
  )
}
