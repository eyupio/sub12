import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { CalendarClock, Check, ChevronRight, Plus, RotateCcw, Settings, Share2, Trash2, Trophy, UserPlus, Users } from 'lucide-react'
import { eventsApi, type EventState, type EventStandingRow, type EventCardStatus, type JoinEventPayload } from '../api/events'
import { scoreCardApi } from '../api/scoreCards'
import { categoriesApi } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { Badge, EntityDetailHeader, PageGrid, Section } from '../components/leagues'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DisciplineThumb } from '../components/leagues/structure'
import { SkeletonCard } from '../components/Skeleton'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { siteOrigin } from '../utils/site'
import { courseLabel, isEventFull, participantsLabel } from '../utils/eventDisplay'

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
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [showReopenConfirm, setShowReopenConfirm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [removingParticipant, setRemovingParticipant] = useState<{ id: string; name: string } | null>(null)

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
  const categoryLookup = useMemo(
    () => new Map((catsQuery.data?.items ?? []).map((c) => [c.id, c])),
    [catsQuery.data],
  )

  const promote = useMutation({
    mutationFn: (target: EventState) => eventsApi.promote(slug, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scores', slug] })
      toast('Event updated', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to promote', 'error'),
  })

  // Pulled in only when the event is complete so the detail page can render a
  // podium block summarising winner + per-band winners. Data is the same
  // scoreboard the live page uses; the scoreboard is sorted server-side.
  const scoreboardQuery = useQuery({
    queryKey: ['event-scoreboard', slug],
    queryFn: () => eventsApi.scoreboard(slug),
    enabled: eventQuery.data?.state === 'complete',
  })
  const podium = useMemo(
    () => buildEventPodium(scoreboardQuery.data?.items ?? [], categoryLookup),
    [scoreboardQuery.data, categoryLookup],
  )

  const join = useMutation({
    mutationFn: (payload: JoinEventPayload) => eventsApi.join(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      setShowJoinForm(false)
      toast('Joined event', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to join', 'error'),
  })

  const removeParticipant = useMutation({
    mutationFn: (participantId: string) => eventsApi.removeParticipant(slug, participantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', slug] })
      queryClient.invalidateQueries({ queryKey: ['event', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      toast('Participant removed', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to remove participant', 'error'),
  })

  function copyLink() {
    const url = `${siteOrigin()}/events/${slug}`
    navigator.clipboard?.writeText(url).then(
      () => toast('Link copied', 'success'),
      () => toast('Could not copy link', 'error'),
    )
  }

  if (eventQuery.isLoading) {
    return (
      <PageGrid>
        <div className="lc-stack" aria-busy>
          <SkeletonCard />
          <SkeletonCard />
        </div>
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
            {isEventFull(ev) && ev.state !== 'complete' && ev.state !== 'archived' && (
              <Badge variant="red">Full</Badge>
            )}
          </span>
        }
        sub={
          <>
            <span>
              {ev.discipline} · {courseLabel(ev)} · {participantsLabel(ev)}
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
            {ev.state === 'complete' ? 'View full results' : 'Live scoreboard'} <ChevronRight size={14} />
          </Link>
          {(ev.state === 'open_for_entries' || ev.state === 'live') && (
            isParticipant ? (
              <button
                type="button"
                disabled
                className="lc-action-ghost"
                aria-label="Already joined"
              >
                <Check size={14} /> Joined
              </button>
            ) : isEventFull(ev) ? (
              <button type="button" disabled className="lc-action-ghost" aria-label="Event full">
                <UserPlus size={14} /> Event full
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (ev.category_ids.length > 0) {
                    setShowJoinForm((v) => !v)
                  } else {
                    join.mutate({})
                  }
                }}
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
              onClick={() => {
                if (nextState === 'complete') {
                  setShowCompleteConfirm(true)
                } else {
                  promote.mutate(nextState)
                }
              }}
              disabled={promote.isPending}
              className="lc-cta"
              style={{ width: 'auto', padding: '8px 14px' }}
            >
              {promote.isPending ? 'Updating…' : labelFor(nextState)}
            </button>
          )}
          {ev.is_owner && ev.state === 'complete' && (
            <button
              type="button"
              onClick={() => setShowReopenConfirm(true)}
              disabled={promote.isPending}
              className="lc-action-ghost"
            >
              <RotateCcw size={14} /> {promote.isPending ? 'Reopening…' : 'Reopen event'}
            </button>
          )}
        </div>

        {showJoinForm && !isParticipant && (
          <JoinForm
            categoryOptions={ev.category_ids
              .map((id) => categoryLookup.get(id))
              .filter((c): c is NonNullable<typeof c> => Boolean(c))}
            isPending={join.isPending}
            onSubmit={(payload) => join.mutate(payload)}
            onCancel={() => setShowJoinForm(false)}
          />
        )}

        <ConfirmDialog
          open={showReopenConfirm}
          title="Reopen this event?"
          message="Scoring will be re-enabled and you can edit shots. The public results post stays in place."
          confirmLabel="Reopen"
          onConfirm={() => {
            setShowReopenConfirm(false)
            promote.mutate('live')
          }}
          onCancel={() => setShowReopenConfirm(false)}
        />

        <ConfirmDialog
          open={showCompleteConfirm}
          title="Mark this event complete?"
          message="Final results are published to participants' feeds and scoring closes. You can reopen the event later if something needs correcting."
          confirmLabel="Mark complete"
          onConfirm={() => {
            setShowCompleteConfirm(false)
            promote.mutate('complete')
          }}
          onCancel={() => setShowCompleteConfirm(false)}
        />

        <ConfirmDialog
          open={!!removingParticipant}
          title={`Remove ${removingParticipant?.name ?? 'participant'}?`}
          message="Their recorded shots and any submitted card for this event are deleted with them. This cannot be undone."
          confirmLabel="Remove"
          onConfirm={() => {
            if (removingParticipant) removeParticipant.mutate(removingParticipant.id)
            setRemovingParticipant(null)
          }}
          onCancel={() => setRemovingParticipant(null)}
        />

        {ev.state === 'complete' && podium.winner && <PodiumSection podium={podium} />}
        {ev.state === 'complete' && (scoreboardQuery.data?.items?.length ?? 0) > 0 && (
          <ResultsTableSection
            slug={ev.slug}
            rows={scoreboardQuery.data?.items ?? []}
            categoryLookup={categoryLookup}
            isCardSubmission={ev.format === 'card_submission'}
          />
        )}

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
          title={
            ev.max_participants
              ? `Participants (${participants.length} of ${ev.max_participants})`
              : `Participants (${participants.length})`
          }
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
                      {p.lane_assignment != null && (
                        <Badge variant="neutral">Lane {p.lane_assignment}</Badge>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {[cat?.label, p.team, p.weapon_label].filter(Boolean).join(' · ') || ' '}
                    </p>
                  </div>
                  {ev.is_owner && (
                    <button
                      type="button"
                      onClick={() => setRemovingParticipant({ id: p.id, name: p.display_name })}
                      disabled={removeParticipant.isPending}
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

function JoinForm({
  categoryOptions,
  isPending,
  onSubmit,
  onCancel,
}: {
  categoryOptions: { id: string; label: string }[]
  isPending: boolean
  onSubmit: (payload: JoinEventPayload) => void
  onCancel: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [team, setTeam] = useState('')

  const inputCls =
    'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      category_id: categoryId || undefined,
      team: team.trim() || undefined,
    })
  }

  return (
    <Section title="Join this event">
      <form onSubmit={submit} className="space-y-2" style={{ padding: '14px 18px' }}>
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
        <input
          type="text"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="Team (optional)"
          className={inputCls}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="submit"
            disabled={isPending}
            className="btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-4 py-2 rounded transition-all"
          >
            {isPending ? 'Joining…' : 'Join event'}
          </button>
          <button type="button" onClick={onCancel} className="lc-action-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Section>
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
        className="btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase px-4 py-2 rounded transition-all"
      >
        {add.isPending ? 'Adding…' : 'Add guest'}
      </button>
    </form>
  )
}

interface EventPodium {
  winner: EventStandingRow | null
  top3: EventStandingRow[]
  perBand: Array<{ row: EventStandingRow; label: string }>
}

function buildEventPodium(
  rows: EventStandingRow[],
  categoryLookup: Map<string, { label: string }>,
): EventPodium {
  if (rows.length === 0) return { winner: null, top3: [], perBand: [] }
  const seen = new Set<string>()
  const perBand: Array<{ row: EventStandingRow; label: string }> = []
  for (const row of rows) {
    if (!row.category_id || seen.has(row.category_id)) continue
    seen.add(row.category_id)
    const label = row.category_label ?? categoryLookup.get(row.category_id)?.label ?? ''
    if (!label) continue
    perBand.push({ row, label })
  }
  return { winner: rows[0], top3: rows.slice(0, 3), perBand }
}

function PodiumSection({ podium }: { podium: EventPodium }) {
  if (!podium.winner) return null
  const winner = podium.winner
  const winnerLabel = winner.category_label ?? ''
  return (
    <Section title="Final results" icon={<Trophy size={12} />}>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={20} color="var(--gold)" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Winner: {winner.display_name}
              {winnerLabel ? ` (${winnerLabel})` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {winner.points} pts · {winner.hit_count} hits
            </div>
          </div>
        </div>
        {podium.top3.length > 1 && (
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 18, margin: 0 }}>
            {podium.top3.map((r) => (
              <li key={r.participant_id} style={{ fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--ink)' }}>{r.display_name}</span>
                {r.category_label ? ` · ${r.category_label}` : ''} · {r.points} pts
              </li>
            ))}
          </ol>
        )}
        {podium.perBand.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 6,
              }}
            >
              Band winners
            </div>
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingLeft: 0,
                margin: 0,
                listStyle: 'none',
              }}
            >
              {podium.perBand.map(({ row, label }) => (
                <li key={row.participant_id} style={{ fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ color: 'var(--ink)' }}>{label}:</span> {row.display_name} · {row.points} pts
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

function ResultsTableSection({
  slug,
  rows,
  categoryLookup,
  isCardSubmission,
}: {
  slug: string
  rows: EventStandingRow[]
  categoryLookup: Map<string, { label: string }>
  isCardSubmission: boolean
}) {
  const pointsLabel = isCardSubmission ? 'Score' : 'Pts'
  const hitsLabel = isCardSubmission ? 'X' : 'Hits'
  return (
    <Section
      title={`Results (${rows.length})`}
      icon={<Trophy size={12} />}
      actions={
        <Link to="/events/$slug/live" params={{ slug }} className="lc-action-ghost">
          Open full view <ChevronRight size={12} />
        </Link>
      }
    >
      <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-2)' }}>
            <th
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                width: 50,
              }}
            >
              #
            </th>
            <th
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Shooter
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '10px 14px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                width: 70,
              }}
            >
              {pointsLabel}
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '10px 14px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                width: 70,
              }}
            >
              {hitsLabel}
            </th>
            {!isCardSubmission && (
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 14px',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  width: 70,
                }}
              >
                Shots
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cat = r.category_id ? categoryLookup.get(r.category_id) : null
            const label = r.category_label ?? cat?.label ?? ''
            return (
              <tr
                key={r.participant_id}
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
              >
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  {r.position}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                    {r.display_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {[label, r.team].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td
                  style={{
                    padding: '12px 14px',
                    textAlign: 'right',
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    color: 'var(--gold)',
                    fontWeight: 600,
                  }}
                >
                  {r.points}
                </td>
                <td
                  style={{
                    padding: '12px 14px',
                    textAlign: 'right',
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                  }}
                >
                  {r.hit_count}
                </td>
                {!isCardSubmission && (
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'right',
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      color: 'var(--muted)',
                    }}
                  >
                    {r.shots_recorded}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </Section>
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
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

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
      setRejectingId(null)
      setRejectReason('')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to reject', 'error'),
  })

  return (
    <Section title="Cards">
      {cardsLoading && (
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="h-12 rounded skeleton" />
          <div className="h-12 rounded skeleton" />
          <div className="h-12 rounded skeleton" />
        </div>
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
                      setRejectingId(c.participant_id)
                      setRejectReason('')
                    }}
                    className="lc-action-ghost"
                    style={{ color: 'var(--red)' }}
                  >
                    Reject
                  </button>
                )}
              </div>
              {rejectingId === c.participant_id && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <textarea
                    placeholder="Reason for rejection (required)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-subtle bg-surface p-2 text-sm resize-none"
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => c.card_id && reject.mutate({ cardId: c.card_id, reason: rejectReason })}
                      disabled={reject.isPending || !rejectReason.trim()}
                      className="lc-action-ghost"
                      style={{ color: 'var(--red)' }}
                    >
                      {reject.isPending ? 'Rejecting…' : 'Submit rejection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="lc-action-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
