import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { eventsApi, type EventDTO, type EventParticipantDTO } from '../api/events'
import { enqueue, flush, installOnlineListener, newClientId } from '../offline/scoreOutbox'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, Section, LoadingRows } from '../components/leagues'
import { toast } from '../store/toast'

// Cycle order: empty → first listed result token → next → … → empty.
function nextResult(current: string, ordered: string[]): string {
  if (!ordered.length) return current
  if (!current) return ordered[0]
  const idx = ordered.indexOf(current)
  if (idx === -1) return ordered[0]
  if (idx === ordered.length - 1) return ''
  return ordered[idx + 1]
}

// Resolve the cycle order for a given event's scoring rules. Falls back to
// a simple X/O cycle when no rules are configured.
function resultCycleFor(ev: EventDTO | undefined): string[] {
  const points = ev?.scoring_rules?.points
  if (!points || Object.keys(points).length === 0) return ['X', 'O']
  // Order: highest-points first, then lower, then zero. Stable for tie-breaks.
  return Object.entries(points)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k)
}

interface LocalShot {
  result: string
  pendingFlush: boolean
  syncError?: boolean
}

// Map of `${participantId}|${lane}|${shot}` → LocalShot
type LocalState = Map<string, LocalShot>

function shotKey(participantId: string, lane: number, shot: number): string {
  return `${participantId}|${lane}|${shot}`
}

export default function EventScorecard() {
  const { slug } = useParams({ from: '/app/events/$slug/scorecard' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null)
  const [local, setLocal] = useState<LocalState>(new Map())

  const evQuery = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const partsQuery = useQuery({
    queryKey: ['event-participants', slug],
    queryFn: () => eventsApi.listParticipants(slug),
  })
  // Per-shot results from the server. Drives the initial display so reload /
  // a co-scorer's edits don't show as empty cells. While the event is live we
  // poll every 5s so co-scorers see each other's writes without manual refresh.
  const scoresQuery = useQuery({
    queryKey: ['event-scores', slug],
    queryFn: () => eventsApi.listScores(slug),
    refetchOnWindowFocus: true,
    refetchInterval: evQuery.data?.state === 'live' ? 5000 : false,
  })

  const ev = evQuery.data
  const participants = useMemo(() => partsQuery.data?.items ?? [], [partsQuery.data])
  // Per-shot server state; local optimistic state overlays on top so a fresh
  // tap shows immediately without waiting for the server round-trip. Computed
  // here (before any early-returns) to satisfy the rules-of-hooks order.
  const serverByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scoresQuery.data?.items ?? []) {
      map.set(shotKey(s.participant_id, s.lane, s.shot_number), s.result)
    }
    return map
  }, [scoresQuery.data])

  useEffect(() => {
    if (!activeParticipantId && participants.length > 0) {
      setActiveParticipantId(participants[0].id)
    }
  }, [participants, activeParticipantId])

  // Auto-flush when we come back online.
  useEffect(() => {
    return installOnlineListener(slug, (n) => {
      if (n > 0) toast(`Synced ${n} score${n === 1 ? '' : 's'}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scores', slug] })
    })
  }, [slug, queryClient])

  // Card-submission events use the score-card flow on EventDetail; redirect
  // bookmarked deep-links rather than rendering the per-shot tap UI.
  useEffect(() => {
    if (ev?.format === 'card_submission') {
      navigate({ to: '/events/$slug', params: { slug }, replace: true })
    }
  }, [ev?.format, navigate, slug])

  const recordMutation = useMutation({
    mutationFn: async (item: { participantId: string; lane: number; shot: number; result: string }) => {
      const clientId = newClientId()
      const recordedAt = new Date().toISOString()
      // Always enqueue first so reload after offline crash preserves the input.
      await enqueue({
        client_id: clientId,
        event_slug: slug,
        participant_id: item.participantId,
        lane: item.lane,
        shot_number: item.shot,
        result: item.result,
        recorded_at: recordedAt,
      })
      // If online, flush immediately. Errors propagate so the UI can surface
      // them; the entry stays in the outbox for the next attempt.
      if (navigator.onLine) {
        const r = await flush(slug)
        return { written: r.written, item }
      }
      return { written: 0, item }
    },
    onSuccess: (_data, vars) => {
      // Clear the syncError flag for this cell on a successful flush.
      setLocal((prev) => {
        const key = shotKey(vars.participantId, vars.lane, vars.shot)
        const cur = prev.get(key)
        if (!cur || (!cur.syncError && !cur.pendingFlush)) return prev
        const next = new Map(prev)
        next.set(key, { ...cur, pendingFlush: false, syncError: false })
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scores', slug] })
    },
    onError: (err, vars) => {
      // Mark the cell so the user can see their tap didn't sync. The local
      // optimistic value stays visible; the outbox keeps the entry queued.
      setLocal((prev) => {
        const key = shotKey(vars.participantId, vars.lane, vars.shot)
        const cur = prev.get(key)
        if (!cur) return prev
        const next = new Map(prev)
        next.set(key, { ...cur, syncError: true })
        return next
      })
      const msg = err instanceof Error ? err.message : 'unknown error'
      toast(`Score didn't sync — ${msg}`, 'error')
    },
  })

  function recordShot(participantId: string, lane: number, shot: number, result: string) {
    setLocal((prev) => {
      const next = new Map(prev)
      next.set(shotKey(participantId, lane, shot), {
        result,
        pendingFlush: !navigator.onLine,
        syncError: false,
      })
      return next
    })
    recordMutation.mutate({ participantId, lane, shot, result })
  }

  if (evQuery.isLoading || partsQuery.isLoading) {
    return (
      <PageGrid>
        <Section title="Scorecard"><LoadingRows rows={6} /></Section>
      </PageGrid>
    )
  }
  if (!ev) {
    return (
      <PageGrid>
        <p style={{ padding: 24, fontSize: 13, color: 'var(--red)' }}>Event not found.</p>
      </PageGrid>
    )
  }
  if (!ev.is_scorer) {
    return (
      <PageGrid>
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            You don't have permission to score this event.
          </p>
          <Link to="/events/$slug" params={{ slug }} className="lc-action-ghost">
            <ChevronLeft size={14} /> Back to event
          </Link>
        </div>
      </PageGrid>
    )
  }

  const cycle = resultCycleFor(ev)
  const lanes = Array.from({ length: ev.course.lanes }, (_, i) => i + 1)
  const shotsPerTarget = Math.max(1, ev.course.shots_per_target)
  const activeParticipant = participants.find((p) => p.id === activeParticipantId) ?? null

  const tally = activeParticipant ? computeTally(local, serverByKey, activeParticipant.id, lanes, shotsPerTarget, ev.scoring_rules.points) : null

  return (
    <PageGrid>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link to="/events/$slug" params={{ slug }} className="lc-icon-btn" aria-label="Back">
          <ChevronLeft size={14} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-page-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
            {ev.name}
            <HelpIcon content={pageHelp.eventScorecard} size={14} />
          </h1>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {ev.discipline} · {ev.course.lanes}L × {shotsPerTarget}S
          </p>
        </div>
      </div>

      <ParticipantTabs
        participants={participants}
        activeId={activeParticipantId}
        onSelect={setActiveParticipantId}
      />

      {activeParticipant && tally && (
        <div className="text-xs text-secondary my-2 flex justify-between">
          <span>
            <strong>{tally.points}</strong> pts · {tally.hits} / {tally.recorded} hits
          </span>
          <span className="text-muted">{tally.recorded} of {lanes.length * shotsPerTarget} shots</span>
        </div>
      )}

      {activeParticipant && (
        <LaneGrid
          ev={ev}
          participant={activeParticipant}
          local={local}
          serverByKey={serverByKey}
          cycle={cycle}
          shotsPerTarget={shotsPerTarget}
          lanes={lanes}
          onShot={recordShot}
        />
      )}

      {!activeParticipant && (
        <p className="text-sm text-muted text-center py-12">
          No participants yet. Add some on the event page.
        </p>
      )}

      {scoresQuery.isFetching && (
        <p className="text-xs text-muted text-center mt-3">Syncing with server…</p>
      )}
    </PageGrid>
  )
}

function ParticipantTabs({
  participants,
  activeId,
  onSelect,
}: {
  participants: EventParticipantDTO[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (participants.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-3 px-3" role="tablist">
      {participants.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={p.id === activeId}
          onClick={() => onSelect(p.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap border transition-colors ${
            p.id === activeId
              ? 'bg-[var(--gold)] border-[var(--gold)] text-white'
              : 'border-subtle text-secondary'
          }`}
        >
          {p.display_name}
          {!p.user_id && <span className="ml-1 opacity-60">(guest)</span>}
        </button>
      ))}
    </div>
  )
}

function LaneGrid({
  ev,
  participant,
  local,
  serverByKey,
  cycle,
  shotsPerTarget,
  lanes,
  onShot,
}: {
  ev: EventDTO
  participant: EventParticipantDTO
  local: LocalState
  serverByKey: Map<string, string>
  cycle: string[]
  shotsPerTarget: number
  lanes: number[]
  onShot: (participantId: string, lane: number, shot: number, result: string) => void
}) {
  const standing = new Set(ev.course.standing_targets ?? [])
  const kneeling = new Set(ev.course.kneeling_targets ?? [])
  const standingSup = new Set(ev.course.standing_supported_targets ?? [])
  const kneelingSup = new Set(ev.course.kneeling_supported_targets ?? [])

  function badgeFor(lane: number): string | null {
    if (standing.has(lane)) return 'S'
    if (kneeling.has(lane)) return 'K'
    if (standingSup.has(lane)) return 'Ss'
    if (kneelingSup.has(lane)) return 'Ks'
    return null
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {lanes.map((lane) => {
        const cells: JSX.Element[] = []
        for (let s = 1; s <= shotsPerTarget; s++) {
          const key = shotKey(participant.id, lane, s)
          const localShot = local.get(key)
          const result = localShot?.result ?? serverByKey.get(key) ?? ''
          const ringClass = localShot?.syncError
            ? 'ring-2 ring-red-500'
            : localShot?.pendingFlush
              ? 'ring-2 ring-amber-400'
              : ''
          cells.push(
            <button
              key={`${lane}-${s}`}
              type="button"
              onClick={() => onShot(participant.id, lane, s, nextResult(result, cycle))}
              aria-label={`Lane ${lane} shot ${s}: ${result || 'empty'}${localShot?.syncError ? ' (sync failed)' : ''}`}
              className={`min-h-[48px] flex-1 rounded-md text-base font-bold flex items-center justify-center transition-colors active:scale-95 ${
                resultClass(result)
              } ${ringClass}`}
            >
              {result || '·'}
            </button>,
          )
        }
        const badge = badgeFor(lane)
        return (
          <div key={lane} className="rounded-lg border border-subtle bg-card p-2">
            <div className="flex items-center justify-between mb-1.5 text-[10px] text-muted">
              <span className="font-mono">L{lane}</span>
              {badge && (
                <span className={`px-1 rounded ${positionBadgeClass(badge)}`}>{badge}</span>
              )}
            </div>
            <div className={`flex gap-1.5 ${shotsPerTarget > 2 ? 'flex-wrap' : ''}`}>{cells}</div>
          </div>
        )
      })}
    </div>
  )
}

function resultClass(result: string): string {
  if (!result) return 'bg-surface-2 text-muted hover:bg-surface-hover'
  if (result === 'X' || result === '2') return 'bg-emerald-600 text-white'
  if (result === '1') return 'bg-amber-500 text-white'
  if (result === 'O' || result === '0') return 'bg-zinc-400 text-white'
  return 'bg-blue-600 text-white'
}

function positionBadgeClass(badge: string): string {
  switch (badge) {
    case 'S':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    case 'K':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
    case 'Ss':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Ks':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

function computeTally(
  local: LocalState,
  serverByKey: Map<string, string>,
  participantId: string,
  lanes: number[],
  shotsPerTarget: number,
  points: Record<string, number> | undefined,
) {
  let pts = 0
  let hits = 0
  let recorded = 0
  for (const lane of lanes) {
    for (let s = 1; s <= shotsPerTarget; s++) {
      const key = shotKey(participantId, lane, s)
      // Local optimistic state wins over server state; both fall back to empty.
      const v = local.get(key)?.result ?? serverByKey.get(key) ?? ''
      if (!v) continue
      recorded++
      if (points) {
        const p = points[v] ?? 0
        pts += p
        if (p > 0) hits++
      } else {
        // Fallback when rules not set: anything not "O" or "0" is a hit.
        if (v !== 'O' && v !== '0') {
          pts += 1
          hits += 1
        }
      }
    }
  }
  return { points: pts, hits, recorded }
}
