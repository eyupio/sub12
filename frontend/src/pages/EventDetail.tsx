import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { CalendarClock, Check, ChevronRight, Plus, Settings, Share2, Trash2, UserPlus, Users } from 'lucide-react'
import { eventsApi, type EventState, type EventCardStatus } from '../api/events'
import { scoreCardApi } from '../api/scoreCards'
import { categoriesApi } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { Badge, EntityDetailHeader, PageGrid, Section } from '../components/leagues'
import { DisciplineThumb } from '../components/leagues/structure'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'

function StateBadge({ state }: { state: EventState }) {
  switch (state) {
    case 'live':
      return <Badge variant="red" live>Live</Badge>
    case 'open_for_entries':
      return <Badge variant="green">Open</Badge>
    case 'complete':
      return <Badge variant="gold">Complete</Badge>
    case 'archived':
      return <Badge variant="neutral">Archived</Badge>
    case 'draft':
    default:
      return <Badge variant="neutral">Draft</Badge>
  }
}

export default function EventDetail() {
  const { slug } = useParams({ from: '/app/events/$slug' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showAddGuest, setShowAddGuest] = useState(false)

  const eventQuery = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const partsQuery = useQuery({
    queryKey: ['event-participants', slug],
    queryFn: () => eventsApi.listParticipants(slug),
  })
  const catsQuery = useQuery({ queryKey: ['categories', 'public'], queryFn: () => categoriesApi.listPublic() })
  // Per-participant card status; only fetched when format is card_submission.
  const cardsQuery = useQuery({
    queryKey: ['event-cards', slug],
    queryFn: () => eventsApi.listEventCards(slug),
    enabled: eventQuery.data?.format === 'card_submission',
    refetchOnWindowFocus: true,
  })

  const currentUserId = useAuthStore((s) => s.user?.id)
  const ev = eventQuery.data
  const participants = partsQuery.data?.items ?? []
  const isParticipant = !!currentUserId && participants.some((p) => p.user_id === currentUserId)
  const categoryLookup = new Map((catsQuery.data?.items ?? []).map((c) => [c.id, c]))

  const promote = useMutation({
    mutationFn: (target: EventState) => eventsApi.promote(slug, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast('Event updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to promote', 'error'),
  })

  const join = useMutation({
    mutationFn: () => eventsApi.join(slug, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      toast('Joined event', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to join', 'error'),
  })

  const removeParticipant = useMutation({
    mutationFn: (participantId: string) => eventsApi.removeParticipant(slug, participantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-participants', slug] }),
  })

  function copyLink() {
    const url = `${window.location.origin}/events/${slug}`
    navigator.clipboard?.writeText(url).then(
      () => toast('Link copied', 'success'),
      () => toast('Could not copy link', 'error'),
    )
  }

  if (eventQuery.isLoading) {
    return (
      <PageGrid>
        <p style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      </PageGrid>
    )
  }
  if (eventQuery.error || !ev) {
    return (
      <PageGrid>
        <p style={{ padding: 24, fontSize: 13, color: 'var(--red)' }}>Failed to load event.</p>
      </PageGrid>
    )
  }

  const nextState = nextStateFor(ev.state)

  return (
    <PageGrid>
      <EntityDetailHeader
        onBack={() => navigate({ to: '/events' })}
        thumb={<DisciplineThumb size={64} icon={<CalendarClock size={28} />} />}
        title={ev.name}
        tag={
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
            <StateBadge state={ev.state} />
          </span>
        }
        sub={
          <>
            <span>
              {ev.discipline} · {ev.course.lanes} lanes
            </span>
            {ev.location && (
              <>
                <span className="lc-detail-sub-sep">·</span>
                <span>{ev.location}</span>
              </>
            )}
            <span className="lc-detail-sub-sep">·</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{ev.slug}</span>
            <HelpIcon content={pageHelp.eventDetail} className="ml-2" />
          </>
        }
        rightActions={
          <>
            <button type="button" onClick={copyLink} className="lc-icon-btn" aria-label="Share">
              <Share2 size={14} />
            </button>
            {ev.is_owner && (
              <button
                type="button"
                onClick={() => navigate({ to: '/events/$slug/settings', params: { slug: ev.slug } })}
                className="lc-icon-btn"
                aria-label="Settings"
              >
                <Settings size={14} />
              </button>
            )}
          </>
        }
      />

      <div className="lc-stack">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ev.is_scorer && ev.format !== 'card_submission' && (
            <Link to="/events/$slug/scorecard" params={{ slug: ev.slug }} className="lc-action-ghost">
              Open scorecard <ChevronRight size={14} />
            </Link>
          )}
          <Link to="/events/$slug/live" params={{ slug: ev.slug }} className="lc-action-ghost">
            Live scoreboard <ChevronRight size={14} />
          </Link>
          {!ev.is_owner && (ev.state === 'open_for_entries' || ev.state === 'live') && (
            isParticipant ? (
              <button
                type="button"
                disabled
                className="lc-action-ghost"
                aria-label="Already joined"
              >
                <Check size={14} /> Joined
              </button>
            ) : (
              <button
                type="button"
                onClick={() => join.mutate()}
                disabled={join.isPending}
                className="lc-action-ghost"
              >
                <UserPlus size={14} /> {join.isPending ? 'Joining…' : 'Join'}
              </button>
            )
          )}
          {ev.is_owner && nextState && (
            <button
              type="button"
              onClick={() => promote.mutate(nextState)}
              disabled={promote.isPending}
              className="lc-cta"
              style={{ width: 'auto', padding: '8px 14px' }}
            >
              {promote.isPending ? 'Updating…' : labelFor(nextState)}
            </button>
          )}
        </div>

        {ev.format === 'card_submission' && (
          <CardSubmissionSection
            slug={slug}
            isLive={ev.state === 'live'}
            isOwner={!!ev.is_owner}
            isScorer={!!ev.is_scorer}
            currentUserId={currentUserId}
            cards={cardsQuery.data?.items ?? []}
            cardsLoading={cardsQuery.isLoading}
            requireVerification={ev.require_score_verification}
          />
        )}

        <Section
          title={`Participants (${participants.length})`}
          icon={<Users size={12} />}
          actions={
            ev.is_owner ? (
              <button
                type="button"
                onClick={() => setShowAddGuest((v) => !v)}
                className="lc-action-ghost"
              >
                <Plus size={12} /> Add guest
              </button>
            ) : null
          }
        >
          <div style={{ padding: showAddGuest ? '14px 18px' : 0 }}>
            {showAddGuest && ev.is_owner && (
              <AddGuestForm
                slug={slug}
                categoryOptions={ev.category_ids
                  .map((id) => categoryLookup.get(id))
                  .filter((c): c is NonNullable<typeof c> => Boolean(c))}
                onAdded={() => {
                  setShowAddGuest(false)
                  queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
                }}
              />
            )}
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column' }}>
            {participants.length === 0 && (
              <li style={{ padding: '14px 18px', fontSize: 13, color: 'var(--muted)' }}>
                No participants yet.
              </li>
            )}
            {participants.map((p, i) => {
              const cat = p.category_id ? categoryLookup.get(p.category_id) : undefined
              return (
                <li
                  key={p.id}
                  style={{
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                        {p.display_name}
                      </span>
                      {!p.user_id && <Badge variant="gold">Guest</Badge>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {[cat?.label, p.team, p.weapon_label].filter(Boolean).join(' · ') || ' '}
                    </p>
                  </div>
                  {ev.is_owner && (
                    <button
                      type="button"
                      onClick={() => removeParticipant.mutate(p.id)}
                      aria-label={`Remove ${p.display_name}`}
                      className="lc-icon-btn"
                      style={{ color: 'var(--red)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      </div>
    </PageGrid>
  )
}

function AddGuestForm({
  slug,
  categoryOptions,
  onAdded,
}: {
  slug: string
  categoryOptions: { id: string; label: string }[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const add = useMutation({
    mutationFn: () =>
      eventsApi.addGuest(slug, {
        guest_name: name.trim(),
        team: team.trim() || undefined,
        category_id: categoryId || undefined,
      }),
    onSuccess: () => {
      toast('Guest added', 'success')
      setName('')
      setTeam('')
      setCategoryId('')
      onAdded()
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to add guest', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    add.mutate()
  }

  const inputCls =
    'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

  return (
    <form onSubmit={onSubmit} className="space-y-2 mb-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Guest name"
        autoFocus
        className={inputCls}
      />
      <input
        type="text"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Team (optional)"
        className={inputCls}
      />
      {categoryOptions.length > 0 && (
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
          <option value="">Category (optional)</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={add.isPending || !name.trim()}
        className="bg-[var(--gold)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-4 py-2 rounded transition-opacity"
      >
        {add.isPending ? 'Adding…' : 'Add guest'}
      </button>
    </form>
  )
}

function nextStateFor(state: EventState): EventState | null {
  switch (state) {
    case 'draft':
      return 'open_for_entries'
    case 'open_for_entries':
      return 'live'
    case 'live':
      return 'complete'
    default:
      return null
  }
}

function labelFor(state: EventState): string {
  switch (state) {
    case 'open_for_entries':
      return 'Open for entries'
    case 'live':
      return 'Go live'
    case 'complete':
      return 'Mark complete'
    default:
      return state
  }
}

function statusLabel(c: EventCardStatus): { label: string; tone: 'green' | 'gold' | 'neutral' | 'red' } {
  if (!c.card_id) return { label: 'No card', tone: 'neutral' }
  if (c.is_draft) return { label: 'In progress', tone: 'gold' }
  if (c.verification === 'verified') return { label: 'Verified', tone: 'green' }
  if (c.verification === 'rejected') return { label: 'Rejected', tone: 'red' }
  return { label: 'Pending', tone: 'gold' }
}

function CardSubmissionSection({
  slug,
  isLive,
  isOwner,
  isScorer,
  currentUserId,
  cards,
  cardsLoading,
  requireVerification,
}: {
  slug: string
  isLive: boolean
  isOwner: boolean
  isScorer: boolean
  currentUserId: string | undefined
  cards: EventCardStatus[]
  cardsLoading: boolean
  requireVerification: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const startCard = useMutation({
    mutationFn: (participantId: string) =>
      scoreCardApi.quickCreate({ event_participant_id: participantId }),
    onSuccess: (card) => {
      navigate({
        to: '/scores/new',
        search: { draftId: card.id, eventSlug: slug } as never,
      })
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to start card', 'error'),
  })

  const confirm = useMutation({
    mutationFn: (cardId: string) => eventsApi.confirmCard(slug, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-cards', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      toast('Card confirmed', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to confirm', 'error'),
  })

  const reject = useMutation({
    mutationFn: ({ cardId, reason }: { cardId: string; reason: string }) =>
      eventsApi.rejectCard(slug, cardId, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-cards', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      toast('Card rejected', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to reject', 'error'),
  })

  return (
    <Section title="Cards">
      {cardsLoading && (
        <p style={{ padding: 18, fontSize: 13, color: 'var(--muted)' }}>Loading cards…</p>
      )}
      {!cardsLoading && cards.length === 0 && (
        <p style={{ padding: 18, fontSize: 13, color: 'var(--muted)' }}>
          No participants yet. Add some on this page.
        </p>
      )}
      <ul style={{ display: 'flex', flexDirection: 'column' }}>
        {cards.map((c, i) => {
          const status = statusLabel(c)
          const isSelf = !!currentUserId && c.user_id === currentUserId
          const canSubmit = isLive && (isSelf || isOwner || isScorer) && (!c.card_id || c.is_draft === true)
          const canVerify = isOwner || isScorer
          const isFinalised = !!c.card_id && c.is_draft === false
          return (
            <li
              key={c.participant_id}
              style={{
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                    {c.display_name}
                  </span>
                  {c.is_guest && <Badge variant="gold">Guest</Badge>}
                  <Badge variant={status.tone}>{status.label}</Badge>
                </div>
                {isFinalised && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Score {c.total_score} · {c.x_count}X
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isFinalised && c.card_id && (
                  <Link
                    to="/scores/$id"
                    params={{ id: c.card_id }}
                    className="lc-action-ghost"
                  >
                    View
                  </Link>
                )}
                {canSubmit && (
                  <button
                    type="button"
                    onClick={() => {
                      if (c.card_id && c.is_draft) {
                        navigate({
                          to: '/scores/new',
                          search: { draftId: c.card_id, eventSlug: slug } as never,
                        })
                      } else {
                        startCard.mutate(c.participant_id)
                      }
                    }}
                    disabled={startCard.isPending}
                    className="lc-action-ghost"
                  >
                    {c.card_id && c.is_draft
                      ? 'Continue'
                      : isSelf
                        ? 'Submit my card'
                        : 'Submit card'}
                  </button>
                )}
                {canVerify && isFinalised && requireVerification && c.verification !== 'verified' && (
                  <button
                    type="button"
                    onClick={() => c.card_id && confirm.mutate(c.card_id)}
                    disabled={confirm.isPending}
                    className="lc-action-ghost"
                  >
                    <Check size={14} /> Verify
                  </button>
                )}
                {canVerify && isFinalised && c.verification !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt('Reason for rejecting this card?')
                      if (reason && c.card_id) reject.mutate({ cardId: c.card_id, reason })
                    }}
                    className="lc-action-ghost"
                    style={{ color: 'var(--red)' }}
                  >
                    Reject
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
