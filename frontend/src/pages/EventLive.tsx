import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { eventsApi } from '../api/events'
import { categoriesApi } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, Section } from '../components/leagues'

const REFRESH_INTERVAL_SECONDS = 30

export default function EventLive() {
  const { slug } = useParams({ from: '/app/events/$slug/live' })
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all')
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS)

  const ev = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.get(slug) })
  const cats = useQuery({ queryKey: ['categories', 'public'], queryFn: () => categoriesApi.listPublic() })
  const board = useQuery({
    queryKey: ['event-scoreboard', slug],
    queryFn: () => eventsApi.scoreboard(slug),
    refetchInterval: REFRESH_INTERVAL_SECONDS * 1000,
    refetchOnWindowFocus: true,
  })

  const categoryLookup = useMemo(() => new Map((cats.data?.items ?? []).map((c) => [c.id, c])), [cats.data])

  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_SECONDS)
  }, [board.dataUpdatedAt])

  useEffect(() => {
    const id = window.setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_SECONDS : c - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const all = board.data?.items ?? []
    if (categoryFilter === 'all') return all
    return all.filter((r) => r.category_id === categoryFilter)
  }, [board.data, categoryFilter])

  const isCardSubmission = ev.data?.format === 'card_submission'
  const pointsLabel = isCardSubmission ? 'Score' : 'Pts'
  const hitsLabel = isCardSubmission ? 'X' : 'Hits'

  return (
    <PageGrid>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link to="/events/$slug" params={{ slug }} className="lc-icon-btn" aria-label="Back to event">
          <ChevronLeft size={14} />
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="t-page-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
            {ev.data?.name ?? 'Live scoreboard'}
            <HelpIcon content={pageHelp.eventLive} size={14} />
          </h1>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {ev.data?.discipline ?? ''} · auto-refresh in {countdown}s
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
            <p style={{ padding: 18, fontSize: 13, color: 'var(--muted)' }}>Loading scoreboard…</p>
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
