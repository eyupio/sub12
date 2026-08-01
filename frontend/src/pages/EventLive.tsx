import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, RefreshCw, Trophy } from 'lucide-react'
import { eventsApi, type EventStandingRow } from '../api/events'
import { categoriesApi } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, Section, LoadingRows } from '../components/leagues'

// Tighten the cadence while the event is live so spectators see new shots
// without manual refresh. When the event is not live (draft / open / complete /
// archived), polling is disabled — the scoreboard fetches once and only
// refreshes via the manual button or window focus.
const LIVE_REFRESH_SECONDS = 5

export default function EventLive() {
  const { slug } = useParams({ from: '/app/events/$slug/live' })
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all')

  const ev = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const cats = useQuery({ queryKey: ['categories', 'public'], queryFn: () => categoriesApi.listPublic() })
  const isLive = ev.data?.state === 'live'
  const isComplete = ev.data?.state === 'complete'
  const board = useQuery({
    queryKey: ['event-scoreboard', slug],
    queryFn: () => eventsApi.scoreboard(slug),
    refetchInterval: isLive ? LIVE_REFRESH_SECONDS * 1000 : false,
    refetchOnWindowFocus: true,
  })

  const [countdown, setCountdown] = useState(LIVE_REFRESH_SECONDS)

  const categoryLookup = useMemo(() => new Map((cats.data?.items ?? []).map((c) => [c.id, c])), [cats.data])

  useEffect(() => {
    setCountdown(LIVE_REFRESH_SECONDS)
  }, [board.dataUpdatedAt, isLive])

  useEffect(() => {
    if (!isLive) return
    const id = window.setInterval(() => setCountdown((c) => (c <= 1 ? LIVE_REFRESH_SECONDS : c - 1)), 1000)
    return () => window.clearInterval(id)
  }, [isLive])

  const rows = useMemo(() => {
    const all = board.data?.items ?? []
    if (categoryFilter === 'all') return all
    return all.filter((r) => r.category_id === categoryFilter)
  }, [board.data, categoryFilter])

  const isCardSubmission = ev.data?.format === 'card_submission'
  const pointsLabel = isCardSubmission ? 'Score' : 'Pts'
  const hitsLabel = isCardSubmission ? 'X' : 'Hits'

  const podium = useMemo(
    () => buildPodium(board.data?.items ?? [], categoryLookup),
    [board.data, categoryLookup],
  )
  const showPodium = ev.data?.state === 'complete' && (board.data?.items?.length ?? 0) > 0

  return (
    <PageGrid>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link to="/events/$slug" params={{ slug }} className="lc-icon-btn" aria-label="Back to event">
          <ChevronLeft size={14} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="t-page-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
            {ev.data?.name ?? (isComplete ? 'Final results' : 'Live scoreboard')}
            <HelpIcon content={pageHelp.eventLive} size={14} />
          </h1>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {ev.data?.discipline ?? ''}
            {isLive && <> · auto-refresh in {countdown}s</>}
            {isComplete && <> · final results</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => board.refetch()}
          aria-label="Refresh"
          className="lc-icon-btn"
        >
          <RefreshCw size={14} className={board.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="lc-stack">
        {showPodium && <PodiumBlock podium={podium} />}
        {ev.data?.category_ids && ev.data.category_ids.length > 0 && (
          <div className="lc-chips">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`lc-chip ${categoryFilter === 'all' ? 'is-active' : ''}`}
            >
              All
            </button>
            {ev.data.category_ids.map((id) => {
              const c = categoryLookup.get(id)
              if (!c) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategoryFilter(id)}
                  className={`lc-chip ${categoryFilter === id ? 'is-active' : ''}`}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        <Section>
          {board.isLoading && (
            <LoadingRows rows={6} />
          )}
          {board.error && (
            <p style={{ padding: 18, fontSize: 13, color: 'var(--red)' }}>
              Failed to load scoreboard.
            </p>
          )}
          {!board.isLoading && !board.error && rows.length === 0 && (
            <p style={{ padding: 32, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              No scores yet.
            </p>
          )}
          {rows.length > 0 && (
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
                          {[cat?.label, r.team].filter(Boolean).join(' · ')}
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
          )}
        </Section>
      </div>
    </PageGrid>
  )
}

interface PodiumData {
  winner: EventStandingRow | null
  top3: EventStandingRow[]
  perBand: Array<{ row: EventStandingRow; label: string }>
}

// buildPodium derives a winner / top-3 / per-band-winner view from the
// already-sorted scoreboard rows. category_label on each row is the server's
// derived label (post-migration); the categoryLookup fallback keeps older
// servers + ad-hoc categories rendering correctly.
function buildPodium(
  rows: EventStandingRow[],
  categoryLookup: Map<string, { label: string }>,
): PodiumData {
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

function PodiumBlock({ podium }: { podium: PodiumData }) {
  if (!podium.winner) return null
  const winnerLabel = podium.winner.category_label ?? ''
  return (
    <Section
      title="Final results"
      icon={<Trophy size={12} />}
    >
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={20} color="var(--gold)" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Winner: {podium.winner.display_name}
              {winnerLabel ? ` (${winnerLabel})` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {podium.winner.points} pts · {podium.winner.hit_count} hits
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
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 0, margin: 0, listStyle: 'none' }}>
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
