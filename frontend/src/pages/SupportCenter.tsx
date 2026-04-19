import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { supportTicketsApi, SupportTicketCategory, SupportTicketPriority, SupportScopeType } from '../api/supportTickets'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { ApiError } from '../api/client'

const categoryOptions: SupportTicketCategory[] = ['question', 'issue', 'feature']
const priorityOptions: SupportTicketPriority[] = ['low', 'normal', 'high', 'urgent']

export default function SupportCenter() {
  const [scopeType, setScopeType] = useState<SupportScopeType>('platform')
  const [scopeID, setScopeID] = useState('')
  const [category, setCategory] = useState<SupportTicketCategory>('issue')
  const [priority, setPriority] = useState<SupportTicketPriority>('normal')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['support-tickets', 'mine'],
    queryFn: () => supportTicketsApi.listMine(50),
  })

  const myLeaguesQuery = useQuery({
    queryKey: ['leagues', 'mine'],
    queryFn: () => leagueApi.listMine(),
    enabled: scopeType === 'league',
  })

  const myClubsQuery = useQuery({
    queryKey: ['clubs', 'mine'],
    queryFn: () => clubsApi.listMine(),
    enabled: scopeType === 'club',
  })

  useEffect(() => {
    setScopeID('')
  }, [scopeType])

  const createMutation = useMutation({
    mutationFn: () => supportTicketsApi.create({
      scope_type: scopeType,
      scope_id: scopeType === 'platform' ? undefined : (scopeID || undefined),
      category,
      priority,
      title: title.trim(),
      description: description.trim(),
    }),
    onSuccess: (ticket) => {
      setSubmitMessage(`Ticket created successfully (${ticket.id}).`)
      setTitle('')
      setDescription('')
      refetch()
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to create ticket'
      setSubmitMessage(msg)
    },
  })

  const sortedTickets = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [data?.items],
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitMessage(null)
    if (!title.trim() || !description.trim()) {
      setSubmitMessage('Please add both a title and description.')
      return
    }
    if (scopeType !== 'platform' && !scopeID) {
      setSubmitMessage(`Please select a ${scopeType}.`)
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-4">
      <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
        <h1 className="text-2xl font-semibold">Support & feature requests</h1>
        <p className="text-sm text-muted mt-1">
          Submit support tickets, including new feature requests. You can also browse and upvote ideas on the{' '}
          <Link to="/feature-requests" className="text-[var(--brass)] hover:underline">Feature Board</Link>.
        </p>

        <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Scope type
              <select className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={scopeType} onChange={e => setScopeType(e.target.value as SupportScopeType)}>
                <option value="platform">Platform</option>
                <option value="league">League</option>
                <option value="club">Club</option>
              </select>
            </label>
            {scopeType === 'league' && (
              <label className="text-sm">
                League
                <select
                  className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
                  value={scopeID}
                  onChange={e => setScopeID(e.target.value)}
                  disabled={myLeaguesQuery.isLoading}
                >
                  <option value="">
                    {myLeaguesQuery.isLoading
                      ? 'Loading leagues…'
                      : (myLeaguesQuery.data?.items ?? []).length === 0
                        ? "You're not a member of any leagues"
                        : 'Select a league…'}
                  </option>
                  {(myLeaguesQuery.data?.items ?? []).map(league => (
                    <option key={league.id} value={league.id}>{league.name}</option>
                  ))}
                </select>
              </label>
            )}
            {scopeType === 'club' && (
              <label className="text-sm">
                Club
                <select
                  className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2"
                  value={scopeID}
                  onChange={e => setScopeID(e.target.value)}
                  disabled={myClubsQuery.isLoading}
                >
                  <option value="">
                    {myClubsQuery.isLoading
                      ? 'Loading clubs…'
                      : (myClubsQuery.data?.items ?? []).length === 0
                        ? "You're not a member of any clubs"
                        : 'Select a club…'}
                  </option>
                  {(myClubsQuery.data?.items ?? []).map(club => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Category
              <select className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={category} onChange={e => setCategory(e.target.value as SupportTicketCategory)}>
                {categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Priority
              <select className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={priority} onChange={e => setPriority(e.target.value as SupportTicketPriority)}>
                {priorityOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>

          <label className="text-sm">
            Title
            <input className="mt-1 w-full rounded-md border border-subtle bg-transparent p-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of your issue or request" />
          </label>

          <label className="text-sm">
            Description
            <textarea className="mt-1 min-h-28 w-full rounded-md border border-subtle bg-transparent p-2" value={description} onChange={e => setDescription(e.target.value)} placeholder="What happened, what you expected, or what feature you'd like added." />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50 disabled:cursor-not-allowed" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Submitting…' : 'Submit ticket'}
            </button>
            {submitMessage && <p className="text-xs text-muted">{submitMessage}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
        <h2 className="text-lg font-semibold">My support tickets</h2>
        {isLoading && <p className="text-sm text-muted mt-2">Loading tickets…</p>}
        {!isLoading && sortedTickets.length === 0 && <p className="text-sm text-muted mt-2">No tickets yet.</p>}
        <div className="mt-3 space-y-2">
          {sortedTickets.map(ticket => (
            <article key={ticket.id} className="rounded-lg border border-subtle p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{ticket.title ?? 'Untitled ticket'}</h3>
                  <p className="text-xs text-muted mt-1">
                    {ticket.category ?? 'ticket'} · {ticket.status ?? 'open'} · {ticket.scope_type ?? 'platform'}
                  </p>
                </div>
                {(ticket.unread?.count ?? ticket.unread_count ?? 0) > 0 && (
                  <span className="rounded-full border border-[var(--brass)]/40 bg-[var(--brass)]/10 px-2 py-0.5 text-xs text-[var(--brass)]">
                    {ticket.unread?.count ?? ticket.unread_count} unread
                  </span>
                )}
              </div>
              {ticket.description && <p className="mt-2 text-sm text-secondary line-clamp-2">{ticket.description}</p>}
              <div className="mt-3">
                <Link to="/support/tickets/$id" params={{ id: ticket.id }} className="text-xs text-[var(--brass)] hover:underline">
                  Open ticket
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
