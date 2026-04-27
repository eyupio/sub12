import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Download, RefreshCw } from 'lucide-react'
import { eventsApi } from '../api/events'
import { categoriesApi } from '../api/categories'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { PageGrid, PageHeader, Section } from '../components/leagues'

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

  return (
    <PageGrid>
      <PageHeader
        title={ev.data?.name ?? 'Live scoreboard'}
        info={<HelpIcon content={pageHelp.eventLive} />}
        description={`${ev.data?.discipline ?? ''} · auto-refresh in ${countdown}s`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => board.refetch()}
              aria-label="Refresh"
              className="lc-icon-btn"
            >
              <RefreshCw size={14} className={board.isFetching ? 'animate-spin' : ''} />
            </button>
            <a href={eventsApi.resultsCsvUrl(slug)} className="lc-action-ghost">
              <Download size={14} /> CSV
            </a>
          </div>
        }
      />

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
                    Pts
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
                    Hits
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
                    Shots
                  </th>
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
