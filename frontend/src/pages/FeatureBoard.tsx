import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useDialogFocus } from '../hooks/useDialogFocus'
import {
  Building2,
  CheckCircle2,
  ChevronUp,
  Globe,
  Hammer,
  Kanban,
  Lightbulb,
  MessageSquare,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { ApiError } from '../api/client'
import { clubsApi } from '../api/clubs'
import { featureRequestsApi, type FeatureRequest, type FeatureRequestScopeType } from '../api/featureRequests'
import { leagueApi } from '../api/leagues'
import { supportTicketsApi } from '../api/supportTickets'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { FeatureRequestVoteButton } from '../components/FeatureRequestVoteButton'
import { MetaChip, PriorityPill, StatusPill } from '../components/featureBoard'
import { toast } from '../store/toast'
import { formatRelativeTime, useRegionalPrefs } from '../utils/date'
import {
  FEATURE_STAGES,
  PRIORITY_ORDER,
  ROADMAP_STAGES,
  stageForStatus,
  type FeatureStageKey,
} from '../utils/featureBoard'

type SortKey = 'top' | 'new' | 'updated'
type ViewKey = 'list' | 'roadmap'
type StageFilter = FeatureStageKey | 'all'

const SCOPES: { key: FeatureRequestScopeType; label: string; icon: typeof Globe; blurb: string }[] = [
  { key: 'platform', label: 'SUB12', icon: Globe, blurb: 'Ideas for the app itself — everyone can vote.' },
  { key: 'league', label: 'My leagues', icon: Trophy, blurb: 'Ideas raised inside a league you belong to.' },
  { key: 'club', label: 'My clubs', icon: Building2, blurb: 'Ideas raised inside a club you belong to.' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'top', label: 'Most voted' },
  { key: 'new', label: 'Newest' },
  { key: 'updated', label: 'Recently updated' },
]

export default function FeatureBoard() {
  const prefs = useRegionalPrefs()
  const [scopeType, setScopeType] = useState<FeatureRequestScopeType>('platform')
  const [scopeID, setScopeID] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
  const [sort, setSort] = useState<SortKey>('top')
  const [view, setView] = useState<ViewKey>('list')
  const [search, setSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)

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

  const scopeOptions = useMemo(() => {
    if (scopeType === 'league') return (myLeaguesQuery.data?.items ?? []).map(l => ({ id: l.id, name: l.name }))
    if (scopeType === 'club') return (myClubsQuery.data?.items ?? []).map(c => ({ id: c.id, name: c.name }))
    return []
  }, [scopeType, myLeaguesQuery.data?.items, myClubsQuery.data?.items])

  const scopeOptionsLoading = scopeType === 'league'
    ? myLeaguesQuery.isLoading
    : scopeType === 'club'
      ? myClubsQuery.isLoading
      : false

  // Land on a real board rather than an empty "pick something" state: the first
  // league or club the viewer belongs to is selected as soon as it is known.
  useEffect(() => {
    if (scopeType === 'platform') return
    if (scopeID && scopeOptions.some(o => o.id === scopeID)) return
    setScopeID(scopeOptions[0]?.id ?? '')
  }, [scopeType, scopeID, scopeOptions])

  const scopeReady = scopeType === 'platform' || scopeID !== ''

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['feature-requests', 'board', scopeType, scopeID],
    queryFn: () => featureRequestsApi.ranking({ scopeType, scopeID: scopeID || undefined, limit: 200 }),
    enabled: scopeReady,
  })

  const allItems = useMemo(() => data?.items ?? [], [data?.items])

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return allItems
    return allItems.filter(item =>
      item.title.toLowerCase().includes(term) ||
      item.refined_description.toLowerCase().includes(term) ||
      item.requester_name.toLowerCase().includes(term))
  }, [allItems, search])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: searched.length }
    for (const item of searched) {
      const key = stageForStatus(item.status).key
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [searched])

  const visible = useMemo(() => {
    const rows = stage === 'all' ? searched : searched.filter(item => stageForStatus(item.status).key === stage)
    return [...rows].sort(comparators[sort])
  }, [searched, stage, sort])

  const totals = useMemo(() => ({
    ideas: allItems.length,
    votes: allItems.reduce((sum, item) => sum + item.vote_count, 0),
    building: allItems.filter(item => stageForStatus(item.status).key === 'building').length,
    shipped: allItems.filter(item => stageForStatus(item.status).key === 'shipped').length,
  }), [allItems])

  const activeScope = SCOPES.find(s => s.key === scopeType) ?? SCOPES[0]
  const scopeLabel = scopeType === 'platform'
    ? 'SUB12'
    : scopeOptions.find(o => o.id === scopeID)?.name ?? activeScope.label
  const hasFilters = stage !== 'all' || search.trim() !== ''

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 lg:px-12 lg:pt-7 lg:pb-20">
      <PageHeader
        eyebrow="Community"
        icon={<Lightbulb size={18} />}
        title="Feature board"
        subtitle="What the community wants next — vote on the ideas you'd use, and follow each one from first suggestion to shipped."
        actions={
          // On a phone this sits beside the title and crushes it to three words
          // per line, so the narrow layout gets its own full-width CTA below.
          <button type="button" className="btn btn-primary u-sheen hidden sm:inline-flex" onClick={() => setComposerOpen(true)}>
            <Plus size={14} aria-hidden="true" />
            Suggest an idea
          </button>
        }
      />

      <button
        type="button"
        className="btn btn-primary u-sheen mb-4 w-full sm:hidden"
        onClick={() => setComposerOpen(true)}
      >
        <Plus size={14} aria-hidden="true" />
        Suggest an idea
      </button>

      {/* ── Scope ───────────────────────────────────────────────────────── */}
      <section className="surface-card p-4 md:p-5 animate-fade-in-up" aria-label="Board scope">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div
            role="tablist"
            aria-label="Which board"
            className="inline-flex rounded-[var(--radius)] border border-subtle bg-surface-2 p-1"
          >
            {SCOPES.map(scope => {
              const Icon = scope.icon
              const selected = scope.key === scopeType
              return (
                <button
                  key={scope.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => { setScopeType(scope.key); setStage('all') }}
                  className={`u-press inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected ? 'bg-surface text-gold shadow-card' : 'text-muted hover:text-secondary'
                  }`}
                >
                  <Icon size={13} aria-hidden="true" />
                  {scope.label}
                </button>
              )
            })}
          </div>

          {scopeType !== 'platform' && (
            <label className="flex items-center gap-2 text-xs text-muted md:justify-end">
              <span className="shrink-0">Showing</span>
              <select
                className="field !w-auto min-w-[12rem] !py-1.5 text-sm"
                value={scopeID}
                onChange={e => setScopeID(e.target.value)}
                disabled={scopeOptionsLoading || scopeOptions.length === 0}
                aria-label={scopeType === 'league' ? 'Choose a league' : 'Choose a club'}
              >
                {scopeOptions.length === 0 && (
                  <option value="">
                    {scopeOptionsLoading ? 'Loading…' : `No ${scopeType}s yet`}
                  </option>
                )}
                {scopeOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">{activeScope.blurb}</p>
      </section>

      {/* Someone with no league or club gets a way forward, not a dead end. */}
      {scopeType !== 'platform' && !scopeOptionsLoading && scopeOptions.length === 0 ? (
        <EmptyPanel
          icon={scopeType === 'league' ? Trophy : Building2}
          title={`You're not in any ${scopeType}s yet`}
          body={`Join a ${scopeType} to see and vote on the ideas its members raise. The SUB12 board is open to everyone in the meantime.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={scopeType === 'league' ? '/leagues' : '/clubs'} className="btn btn-secondary">
                Browse {scopeType}s
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => setScopeType('platform')}>
                Back to the SUB12 board
              </button>
            </div>
          }
        />
      ) : (
        <>
          {/* ── Pulse ───────────────────────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 u-stagger">
            <StatTile icon={Lightbulb} label="Ideas" value={totals.ideas} loading={isLoading} />
            <StatTile icon={ChevronUp} label="Votes cast" value={totals.votes} loading={isLoading} />
            <StatTile icon={Hammer} label="In progress" value={totals.building} loading={isLoading} />
            <StatTile icon={CheckCircle2} label="Shipped" value={totals.shipped} loading={isLoading} accent />
          </div>

          {/* ── Controls ────────────────────────────────────────────────── */}
          <section className="mt-4 space-y-3" aria-label="Filter ideas">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  className="field !pl-9"
                  placeholder="Search ideas…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label="Search ideas"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="feature-sort">Sort ideas</label>
                <select
                  id="feature-sort"
                  className="field !w-auto !py-2 text-sm"
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                >
                  {SORTS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <div className="inline-flex rounded-[var(--radius)] border border-subtle bg-surface-2 p-1" role="group" aria-label="Layout">
                  <ViewToggle current={view} value="list" onSelect={setView} icon={Rows3} label="List" />
                  <ViewToggle current={view} value="roadmap" onSelect={setView} icon={Kanban} label="Roadmap" />
                </div>
              </div>
            </div>

            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <StageChip label="All ideas" count={stageCounts.all ?? 0} selected={stage === 'all'} onSelect={() => setStage('all')} />
              {FEATURE_STAGES.map(item => (
                <StageChip
                  key={item.key}
                  label={item.label}
                  count={stageCounts[item.key] ?? 0}
                  color={item.color}
                  selected={stage === item.key}
                  onSelect={() => setStage(item.key)}
                />
              ))}
            </div>
          </section>

          {/* ── Results ─────────────────────────────────────────────────── */}
          <div className="mt-4">
            {isLoading && <BoardSkeleton />}

            {isError && (
              <EmptyPanel
                icon={Lightbulb}
                title="Couldn't load the board"
                body="Something went wrong fetching the ideas for this scope."
                action={<button type="button" className="btn btn-secondary" onClick={() => refetch()}>Try again</button>}
              />
            )}

            {!isLoading && !isError && allItems.length === 0 && (
              <EmptyPanel
                icon={Sparkles}
                title="No ideas here yet"
                body={`Be the first to suggest something for ${scopeLabel}. Every idea is read, refined and put to a community vote.`}
                action={
                  <button type="button" className="btn btn-primary u-sheen" onClick={() => setComposerOpen(true)}>
                    <Plus size={14} aria-hidden="true" />
                    Suggest an idea
                  </button>
                }
              />
            )}

            {!isLoading && !isError && allItems.length > 0 && visible.length === 0 && (
              <EmptyPanel
                icon={Search}
                title="Nothing matches those filters"
                body="Try a different stage, or clear the search to see everything on this board."
                action={
                  hasFilters ? (
                    <button type="button" className="btn btn-secondary" onClick={() => { setStage('all'); setSearch('') }}>
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}

            {!isLoading && !isError && visible.length > 0 && (
              view === 'list'
                ? (
                  <ul className="space-y-3 u-stagger">
                    {visible.map((item, index) => (
                      <li key={item.id}>
                        <FeatureCard
                          item={item}
                          rank={sort === 'top' && index < 3 ? index + 1 : undefined}
                          prefs={prefs}
                        />
                      </li>
                    ))}
                  </ul>
                )
                : <RoadmapView items={visible} prefs={prefs} />
            )}
          </div>
        </>
      )}

      <IdeaComposer
        open={composerOpen}
        scopeType={scopeType}
        scopeID={scopeID}
        scopeLabel={scopeLabel}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  )
}

const comparators: Record<SortKey, (a: FeatureRequest, b: FeatureRequest) => number> = {
  // Ties on votes fall back to priority then recency, so the top of the board is
  // never an arbitrary shuffle of zero-vote ideas.
  top: (a, b) =>
    b.vote_count - a.vote_count ||
    PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] ||
    Date.parse(b.created_at) - Date.parse(a.created_at),
  new: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  updated: (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
}

type Prefs = ReturnType<typeof useRegionalPrefs>

/**
 * Roadmap columns are far too narrow for the list layout's left vote rail — it
 * squeezes the title into a three-word ribbon. Compact cards stack instead and
 * drop the vote control to an inline chip in the footer.
 */
function CompactFeatureCard({ item, prefs }: { item: FeatureRequest; prefs: Prefs }) {
  return (
    <article className="surface-card u-lift p-3">
      <Link
        to="/feature-requests/$id"
        params={{ id: item.id }}
        className="block text-sm font-semibold leading-snug text-primary hover:text-gold transition-colors"
      >
        {item.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityPill priority={item.priority} />
        {item.scope_type !== 'platform' && item.scope_name && (
          <MetaChip icon={item.scope_type === 'league' ? Trophy : Building2}>{item.scope_name}</MetaChip>
        )}
        {item.comment_count > 0 && (
          <MetaChip icon={MessageSquare}>
            {item.comment_count}
            <span className="sr-only"> comments</span>
          </MetaChip>
        )}
      </div>
      {/* Stacked, not side by side: a roadmap column is too narrow to sit the
          vote chip next to attribution without clipping both. */}
      <div className="mt-2.5">
        <FeatureRequestVoteButton
          featureRequestID={item.id}
          initialVoted={item.viewer_has_voted}
          initialCount={item.vote_count}
        />
      </div>
      <p className="mt-2 truncate text-[11px] text-muted">
        {item.requester_name} · {formatRelativeTime(item.updated_at, prefs)}
      </p>
    </article>
  )
}

function FeatureCard({ item, rank, prefs }: { item: FeatureRequest; rank?: number; prefs: Prefs }) {
  return (
    <article className="surface-card u-lift flex gap-3 p-4">
      <FeatureRequestVoteButton
        featureRequestID={item.id}
        initialVoted={item.viewer_has_voted}
        initialCount={item.vote_count}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {rank && (
            <span
              className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-gold-tint px-1.5 text-[10px] font-bold text-gold"
              title={`#${rank} most voted`}
            >
              #{rank}
            </span>
          )}
          <Link
            to="/feature-requests/$id"
            params={{ id: item.id }}
            className="min-w-0 font-semibold leading-snug text-primary hover:text-gold transition-colors"
          >
            {item.title}
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusPill status={item.status} />
          <PriorityPill priority={item.priority} />
          {item.scope_type !== 'platform' && item.scope_name && (
            <MetaChip icon={item.scope_type === 'league' ? Trophy : Building2}>{item.scope_name}</MetaChip>
          )}
          {item.comment_count > 0 && (
            <MetaChip icon={MessageSquare}>
              {item.comment_count}
              <span className="sr-only"> comments</span>
            </MetaChip>
          )}
        </div>

        {item.refined_description && (
          <p className="mt-2 line-clamp-2 text-sm text-secondary">{item.refined_description}</p>
        )}

        <p className="mt-2 text-xs text-muted">
          Suggested by <span className="text-secondary">{item.requester_name}</span> · updated {formatRelativeTime(item.updated_at, prefs)}
        </p>
      </div>
    </article>
  )
}

function RoadmapView({ items, prefs }: { items: FeatureRequest[]; prefs: Prefs }) {
  return (
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
      {ROADMAP_STAGES.map(stage => {
        const stageItems = items.filter(item => stageForStatus(item.status).key === stage.key)
        const Icon = stage.icon
        return (
          <section key={stage.key} className="rounded-[var(--radius-lg)] border border-subtle bg-surface-2 p-3" aria-label={stage.label}>
            <header className="flex items-center justify-between gap-2 px-1">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: stage.color }}>
                <Icon size={13} aria-hidden="true" />
                {stage.label}
              </h2>
              <span className="u-tnum rounded-full border border-subtle px-2 py-0.5 text-[11px] text-muted">{stageItems.length}</span>
            </header>
            <p className="mt-1 px-1 text-[11px] text-muted">{stage.blurb}</p>
            <ul className="mt-3 space-y-2">
              {stageItems.length === 0 && (
                <li className="rounded-[var(--radius)] border border-dashed border-subtle px-3 py-4 text-center text-xs text-muted">
                  Nothing here yet
                </li>
              )}
              {stageItems.map(item => (
                <li key={item.id}>
                  <CompactFeatureCard item={item} prefs={prefs} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function StatTile({ icon: Icon, label, value, loading, accent = false }: {
  icon: typeof Lightbulb
  label: string
  value: number
  loading?: boolean
  accent?: boolean
}) {
  return (
    <div className="surface-card px-3 py-3">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        <Icon size={12} aria-hidden="true" className={accent ? 'text-[var(--green)]' : 'text-gold'} />
        {label}
      </p>
      {loading
        ? <Skeleton className="mt-1.5 h-7 w-12" />
        : <p className={`u-tnum mt-1 text-2xl font-bold leading-none ${accent ? 'text-[var(--green)]' : 'text-primary'}`}>{value}</p>}
    </div>
  )
}

function StageChip({ label, count, color, selected, onSelect }: {
  label: string
  count: number
  color?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`u-press inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected ? 'border-gold bg-gold-tint text-gold' : 'border-subtle text-muted hover:text-secondary'
      }`}
    >
      {color && !selected && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      )}
      {label}
      <span className="u-tnum opacity-70">{count}</span>
    </button>
  )
}

function ViewToggle({ current, value, onSelect, icon: Icon, label }: {
  current: ViewKey
  value: ViewKey
  onSelect: (v: ViewKey) => void
  icon: typeof Rows3
  label: string
}) {
  const selected = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      title={`${label} view`}
      className={`u-press inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        selected ? 'bg-surface text-gold shadow-card' : 'text-muted hover:text-secondary'
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function EmptyPanel({ icon: Icon, title, body, action }: {
  icon: typeof Lightbulb
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="surface-card mt-4 px-6 py-10 text-center animate-fade-in">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold-tint text-gold">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 className="t-subsection-title mt-3">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="surface-card flex gap-3 p-4">
          <Skeleton className="h-14 w-14 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Suggesting an idea opens a support ticket in the feature category — the same
 * path an admin refines onto the board — so the composer never asks the person
 * for anything the board already knows (scope, category, IDs).
 */
function IdeaComposer({ open, scopeType, scopeID, scopeLabel, onClose }: {
  open: boolean
  scopeType: FeatureRequestScopeType
  scopeID: string
  scopeLabel: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submittedTicketID, setSubmittedTicketID] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setError(null)
    setSubmittedTicketID(null)
    titleRef.current?.focus()
  }, [open])

  useDialogFocus({ dialogRef, initialFocusRef: titleRef, onClose, open })

  const createMutation = useMutation({
    mutationFn: () => supportTicketsApi.create({
      scope_type: scopeType,
      scope_id: scopeType === 'platform' ? undefined : scopeID,
      category: 'feature',
      priority: 'normal',
      title: title.trim(),
      description: description.trim(),
    }),
    onSuccess: (ticket) => {
      setSubmittedTicketID(ticket.id)
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      toast('Idea submitted', 'success')
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Failed to submit your idea.')
    },
  })

  if (!open) return null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (title.trim().length < 4) {
      setError('Give your idea a short, clear title.')
      return
    }
    if (description.trim().length < 10) {
      setError('Add a sentence or two on what you want and why.')
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-composer-title"
        className="surface-card relative w-full max-w-lg animate-sheet-up overflow-y-auto rounded-b-none sm:animate-scale-in sm:rounded-[var(--radius-lg)] max-h-[92vh] shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-subtle p-4">
          <h2 id="idea-composer-title" className="inline-flex items-center gap-2 font-semibold text-primary">
            <Sparkles size={16} className="text-gold" aria-hidden="true" />
            Suggest an idea
          </h2>
          <button type="button" onClick={onClose} className="u-press text-muted hover:text-secondary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {submittedTicketID ? (
          <div className="p-6 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold-tint text-gold">
              <CheckCircle2 size={20} aria-hidden="true" />
            </span>
            <h3 className="t-subsection-title mt-3">Thanks — that's in</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              An admin will refine your idea and put it on the board, where everyone can vote on it. You'll be notified as it
              moves along.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/support/tickets/$id" params={{ id: submittedTicketID }} className="btn btn-secondary">
                Track your idea
              </Link>
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 p-4">
            <div className="flex items-center gap-2 rounded-[var(--radius)] border border-subtle bg-surface-2 px-3 py-2 text-xs text-muted">
              <Users size={13} className="text-gold" aria-hidden="true" />
              Posting to <span className="font-semibold text-secondary">{scopeLabel}</span>
            </div>

            <label className="block text-sm">
              <span className="text-secondary">What would you like to see?</span>
              <input
                ref={titleRef}
                className="field mt-1"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. Compare two pellet tests side by side"
              />
            </label>

            <label className="block text-sm">
              <span className="text-secondary">Why would it help?</span>
              <textarea
                className="field mt-1 min-h-28"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What are you trying to do today, and where does the app get in the way?"
              />
            </label>

            {error && <p role="alert" className="text-xs text-[var(--error-text)]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary u-sheen" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Sending…' : 'Submit idea'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
