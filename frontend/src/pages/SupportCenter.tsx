import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HelpCircle, Lightbulb, MessageSquare } from 'lucide-react'
import { supportTicketsApi, SupportTicketCategory, SupportTicketPriority, SupportScopeType, SupportTicketStatus } from '../api/supportTickets'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { ApiError } from '../api/client'
import { SkeletonList } from '../components/Skeleton'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

// Labelled rather than raw enum values — "feature" alone doesn't tell a new
// user that this is where a feature *request* goes.
const categoryOptions: { value: SupportTicketCategory; label: string; hint: string }[] = [
  { value: 'question', label: 'Question', hint: "You're not sure how something works." },
  { value: 'issue', label: 'Something is broken', hint: 'Something behaved differently to how you expected.' },
  { value: 'feature', label: 'Feature request', hint: "You'd like sub12 to do something it doesn't yet." },
]

const priorityOptions: { value: SupportTicketPriority; label: string }[] = [
  { value: 'low', label: 'Low — whenever you get to it' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High — it is blocking me' },
  { value: 'urgent', label: 'Urgent — a match is affected' },
]

const statusLabels: Record<SupportTicketStatus, string> = {
  open: 'Open',
  in_progress: 'Being looked at',
  waiting_on_user: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
}

const categoryLabels: Record<SupportTicketCategory, string> = {
  question: 'Question',
  issue: 'Issue',
  feature: 'Feature request',
}

export default function SupportCenter() {
  const [scopeType, setScopeType] = useState<SupportScopeType>('platform')
  const [scopeID, setScopeID] = useState('')
  const [category, setCategory] = useState<SupportTicketCategory>('issue')
  const [priority, setPriority] = useState<SupportTicketPriority>('normal')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState(false)

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
    onSuccess: () => {
      setSubmitOk(true)
      setSubmitMessage("Thanks — your ticket is in. We'll reply in the thread below and notify you.")
      setTitle('')
      setDescription('')
      refetch()
    },
    onError: (err: unknown) => {
      setSubmitOk(false)
      setSubmitMessage(err instanceof ApiError ? err.message : 'Failed to create ticket')
    },
  })

  const sortedTickets = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [data?.items],
  )

  const activeCategory = categoryOptions.find(o => o.value === category)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitMessage(null)
    setSubmitOk(false)
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
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20 space-y-5 lg:space-y-6">
      <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
        <div className="flex items-center gap-2">
          <h1 className="t-page-title">Support &amp; feature requests</h1>
          <HelpIcon content={pageHelp.support} />
        </div>
        <p className="text-sm text-muted mt-1">
          A real person reads every ticket. Nothing here is too basic to ask.
        </p>

        {/* Most first-week questions already have an answer written down. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            to="/help"
            className="flex items-start gap-3 rounded-lg border border-subtle p-3 hover:border-[var(--brass)]/50 hover:bg-surface-hover u-nudge transition-colors"
          >
            <HelpCircle size={16} className="mt-0.5 shrink-0 text-[var(--brass)]" />
            <span className="min-w-0">
              <span className="block text-sm text-primary">Check Help &amp; FAQ first</span>
              <span className="mt-0.5 block text-xs text-muted">
                Guides for scoring, gear, leagues, clubs and pellet testing — usually the quickest answer.
              </span>
            </span>
          </Link>
          <Link
            to="/feature-requests"
            className="flex items-start gap-3 rounded-lg border border-subtle p-3 hover:border-[var(--brass)]/50 hover:bg-surface-hover u-nudge transition-colors"
          >
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-[var(--brass)]" />
            <span className="min-w-0">
              <span className="block text-sm text-primary">Browse the Feature Board</span>
              <span className="mt-0.5 block text-xs text-muted">
                Someone may have asked already — upvoting an existing idea carries more weight.
              </span>
            </span>
          </Link>
        </div>

        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              What is this about?
              <select className="field mt-1" value={category} onChange={e => setCategory(e.target.value as SupportTicketCategory)}>
                {categoryOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {activeCategory && <span className="mt-1 block text-xs text-muted">{activeCategory.hint}</span>}
            </label>
            <label className="text-sm">
              How urgent is it?
              <select className="field mt-1" value={priority} onChange={e => setPriority(e.target.value as SupportTicketPriority)}>
                {priorityOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Where does it apply?
              <select className="field mt-1" value={scopeType} onChange={e => setScopeType(e.target.value as SupportScopeType)}>
                <option value="platform">Anywhere in sub12</option>
                <option value="league">A specific league</option>
                <option value="club">A specific club</option>
              </select>
              <span className="mt-1 block text-xs text-muted">
                Picking a league or club routes the ticket to its admins.
              </span>
            </label>
            {scopeType === 'league' && (
              <label className="text-sm">
                League
                <select
                  className="field mt-1"
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
                  className="field mt-1"
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

          <label className="text-sm">
            Title
            <input className="field mt-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of your issue or request" />
          </label>

          <label className="text-sm">
            Description
            <textarea
              className="field mt-1 min-h-28"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={
                category === 'feature'
                  ? "What would you like sub12 to do, and what would it help you achieve?"
                  : "What were you doing, what happened, and what did you expect instead? Which screen were you on?"
              }
            />
            <span className="mt-1 block text-xs text-muted">
              {category === 'feature'
                ? 'The why matters as much as the what — it helps us find the best solution.'
                : 'The more detail the better: the screen you were on, and anything you tried already.'}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Submitting…' : 'Submit ticket'}
            </button>
            {submitMessage && (
              <p className={`text-xs ${submitOk ? 'text-[var(--brass)]' : 'text-red-600 dark:text-red-400'}`} role="status">
                {submitMessage}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6">
        <h2 className="t-subsection-title">My support tickets</h2>
        {isLoading && <div className="mt-3"><SkeletonList count={2} /></div>}
        {!isLoading && sortedTickets.length === 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-subtle p-6 text-center">
            <MessageSquare size={20} className="mx-auto text-muted" />
            <p className="mt-2 text-sm text-primary">No tickets yet.</p>
            <p className="mt-1 text-xs text-muted">
              Anything you send will appear here, with our replies attached.
            </p>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {sortedTickets.map(ticket => (
            <article key={ticket.id} className="rounded-lg border border-subtle p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="t-subsection-title">{ticket.title ?? 'Untitled ticket'}</h3>
                  <p className="text-xs text-muted mt-1">
                    {ticket.category ? categoryLabels[ticket.category] : 'Ticket'}
                    {' · '}
                    {ticket.status ? statusLabels[ticket.status] : 'Open'}
                    {' · '}
                    {ticket.scope_type ?? 'platform'}
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
