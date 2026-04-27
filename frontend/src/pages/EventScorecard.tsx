import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { eventsApi, type EventDTO, type EventParticipantDTO } from '../api/events'
import { enqueue, flush, installOnlineListener, newClientId, peek } from '../offline/scoreOutbox'
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
}

// Map of `${participantId}|${lane}|${shot}` → LocalShot
type LocalState = Map<string, LocalShot>

function shotKey(participantId: string, lane: number, shot: number): string {
  return `${participantId}|${lane}|${shot}`
}

export default function EventScorecard() {
  const { slug } = useParams({ from: '/app/events/$slug/scorecard' })
  const queryClient = useQueryClient()
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null)
  const [local, setLocal] = useState<LocalState>(new Map())
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [outboxSize, setOutboxSize] = useState(0)
  const [flushing, setFlushing] = useState(false)

  const evQuery = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const partsQuery = useQuery({
    queryKey: ['event-participants', slug],
    queryFn: () => eventsApi.listParticipants(slug),
  })
  // Per-shot results from the server. Drives the initial display so reload /
  // a co-scorer's edits don't show as empty cells.
  const scoresQuery = useQuery({
    queryKey: ['event-scores', slug],
    queryFn: () => eventsApi.listScores(slug),
    refetchOnWindowFocus: true,
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

  // Online/offline listeners + initial outbox size.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onlineHandler = () => setIsOnline(true)
    const offlineHandler = () => setIsOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    peek(slug)
      .then((items) => !cancelled && setOutboxSize(items.length))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  // Auto-flush when we go online.
  useEffect(() => {
    return installOnlineListener(slug, async (n) => {
      if (n > 0) toast(`Synced ${n} score${n === 1 ? '' : 's'}`, 'success')
      const remaining = await peek(slug).catch(() => [])
      setOutboxSize(remaining.length)
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
    })
  }, [slug, queryClient])

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
      const queueSize = (await peek(slug)).length
      setOutboxSize(queueSize)
      // If online, flush immediately. Errors leave the entry in the outbox.
      if (navigator.onLine) {
        try {
          const r = await flush(slug)
          setOutboxSize((await peek(slug)).length)
          return r.written
        } catch {
          return 0
        }
      }
      return 0
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
      queryClient.invalidateQueries({ queryKey: ['event-scores', slug] })
    },
  })

  function recordShot(participantId: string, lane: number, shot: number, result: string) {
    setLocal((prev) => {
      const next = new Map(prev)
      next.set(shotKey(participantId, lane, shot), { result, pendingFlush: !navigator.onLine })
      return next
    })
    recordMutation.mutate({ participantId, lane, shot, result })
  }

  async function manualFlush() {
    setFlushing(true)
    try {
      const r = await flush(slug)
      const remaining = (await peek(slug)).length
      setOutboxSize(remaining)
      if (r.written > 0) toast(`Synced ${r.written} score${r.written === 1 ? '' : 's'}`, 'success')
      else toast('Nothing to sync', 'info')
      queryClient.invalidateQueries({ queryKey: ['event-scoreboard', slug] })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setFlushing(false)
    }
  }

  if (evQuery.isLoading || partsQuery.isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (!ev) return <p className="p-6 text-sm text-red-600">Event not found.</p>
  if (!ev.is_scorer) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-sm text-secondary mb-3">You don't have permission to score this event.</p>
        <Link to="/events/$slug" params={{ slug }} className="text-blue-600 hover:underline text-sm">
          Back to event
        </Link>
      </div>
    )
  }

  const cycle = resultCycleFor(ev)
  const lanes = Array.from({ length: ev.course.lanes }, (_, i) => i + 1)
  const shotsPerTarget = Math.max(1, ev.course.shots_per_target)
  const activeParticipant = participants.find((p) => p.id === activeParticipantId) ?? null

  const tally = activeParticipant ? computeTally(local, serverByKey, activeParticipant.id, lanes, shotsPerTarget, ev.scoring_rules.points) : null

  return (
    <div className="max-w-3xl mx-auto px-3 py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">{ev.name}</h1>
          <p className="text-xs text-muted">
            {ev.discipline} · {ev.course.lanes}L × {shotsPerTarget}S
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SyncBadge online={isOnline} pending={outboxSize} flushing={flushing} onClick={manualFlush} />
          <Link
            to="/events/$slug"
            params={{ slug }}
            className="text-sm text-blue-600 hover:underline"
          >
            Back
          </Link>
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
    </div>
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
              ? 'bg-blue-600 border-blue-600 text-white'
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
          cells.push(
            <button
              key={`${lane}-${s}`}
              type="button"
              onClick={() => onShot(participant.id, lane, s, nextResult(result, cycle))}
              aria-label={`Lane ${lane} shot ${s}: ${result || 'empty'}`}
              className={`min-h-[48px] flex-1 rounded-md text-base font-bold flex items-center justify-center transition-colors active:scale-95 ${
                resultClass(result)
              } ${localShot?.pendingFlush ? 'ring-2 ring-amber-400' : ''}`}
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

function SyncBadge({
  online,
  pending,
  flushing,
  onClick,
}: {
  online: boolean
  pending: number
  flushing: boolean
  onClick: () => void
}) {
  let label = online ? 'Synced' : 'Offline'
  let cls = online
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  if (pending > 0) {
    label = `${pending} queued`
    cls = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={online ? 'Tap to force sync' : 'Offline — scores queued locally'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${cls} ${flushing ? 'opacity-60' : ''}`}
    >
      {online ? <Cloud size={12} /> : <CloudOff size={12} />}
      {flushing ? <RefreshCw size={12} className="animate-spin" /> : null}
      {label}
    </button>
  )
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
