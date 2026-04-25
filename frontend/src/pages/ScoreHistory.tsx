import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Check,
  CheckCircle,
  ChevronDown,
  Download,
  Eye,
  Grid2X2,
  Plus,
  Share2,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { scoreCardApi, ScoreCardSummary } from '../api/scoreCards'
import { gearApi } from '../api/gear'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { ShareDialog } from '../components/ShareDialog'
import './scores.css'

type ScoreScope = 'all' | 'personal' | 'league' | 'club'
type StatTab = 'form' | 'rifles' | 'pellets'
type StatusFilter = 'any' | 'verified' | 'pending' | 'rejected'
type SortMode = 'newest' | 'highest' | 'x'

type WeekGroup = {
  key: string
  label: string
  count: number
  best: number
  items: ScoreCardSummary[]
}

function scoreDate(card: ScoreCardSummary): Date {
  return new Date(card.shot_at || card.created_at)
}

function scoreTime(card: ScoreCardSummary): string {
  return scoreDate(card).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(card: ScoreCardSummary): string {
  return scoreDate(card).toLocaleDateString('en-GB')
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}

function weekLabel(date: Date): string {
  const start = startOfIsoWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

function cardScope(card: ScoreCardSummary): Exclude<ScoreScope, 'all'> {
  if (card.league_id || card.league_round_id || card.league_name) return 'league'
  if (card.club_id) return 'club'
  return 'personal'
}

function trendFor(card: ScoreCardSummary, cards: ScoreCardSummary[]): number | null {
  const prior = cards
    .filter((c) => c.id !== card.id && scoreDate(c) < scoreDate(card))
    .filter((c) => cardScope(c) !== 'league' || c.verification === 'verified')
    .sort((a, b) => scoreDate(b).getTime() - scoreDate(a).getTime())
    .slice(0, 20)
  if (prior.length === 0) return null
  const avg = prior.reduce((sum, c) => sum + c.total_score, 0) / prior.length
  return card.total_score - avg
}

function previousPbDelta(card: ScoreCardSummary, cards: ScoreCardSummary[]): number | null {
  const prior = cards.filter((c) => c.id !== card.id && scoreDate(c) < scoreDate(card))
  if (prior.length === 0) return null
  const bestBefore = Math.max(...prior.map((c) => c.total_score))
  return card.total_score > bestBefore ? card.total_score - bestBefore : null
}

function isPersonalBest(card: ScoreCardSummary, cards: ScoreCardSummary[]): boolean {
  const sorted = [...cards].sort((a, b) => scoreDate(a).getTime() - scoreDate(b).getTime())
  let best = -Infinity
  for (const item of sorted) {
    if (item.id === card.id) return item.total_score > best
    best = Math.max(best, item.total_score)
  }
  return false
}

function MiniTarget({ card, selected = false }: { card: ScoreCardSummary; selected?: boolean }) {
  const points = useMemo(() => {
    const seed = card.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
    const quality = Math.max(0.18, Math.min(0.88, (250 - card.total_score) / 85))
    return Array.from({ length: 9 }).map((_, index) => {
      const angle = (seed * (index + 5) * 17) % 360
      const dist = ((seed + index * 13) % 100) / 100 * quality
      return {
        x: 28 + Math.cos(angle) * dist * 22,
        y: 28 + Math.sin(angle) * dist * 22,
        gold: index < Math.max(1, Math.min(5, card.x_count)),
      }
    })
  }, [card.id, card.total_score, card.x_count])

  if (card.card_image_url) {
    return (
      <img
        src={card.card_image_url}
        alt=""
        className={`scores-mini-thumb ${selected ? 'is-selected' : ''}`}
        loading="lazy"
      />
    )
  }

  return (
    <svg className={`scores-mini-target ${selected ? 'is-selected' : ''}`} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" />
      <circle cx="28" cy="28" r="18" />
      <circle cx="28" cy="28" r="12" />
      <circle cx="28" cy="28" r="6" />
      {points.map((p, index) => (
        <circle key={index} className={p.gold ? 'shot gold' : 'shot'} cx={p.x} cy={p.y} r="1.7" />
      ))}
    </svg>
  )
}

function TypeChip({ card }: { card: ScoreCardSummary }) {
  const scope = cardScope(card)
  const Icon = scope === 'league' ? Trophy : scope === 'club' ? Users : Target
  return (
    <span className={`scores-chip ${scope}`}>
      <Icon size={11} />
      {scope}
    </span>
  )
}

function StatusPill({ status }: { status?: string }) {
  if (!status || status === 'none') return null
  const label = status === 'verified' ? 'Verified' : status === 'rejected' ? 'Rejected' : 'Pending'
  return (
    <span className={`scores-status ${status}`}>
      {status === 'verified' && <CheckCircle size={10} />}
      {label}
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="scores-sparkline-empty" />
  const width = 178
  const height = 42
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - 5 - ((value - min) / range) * (height - 10)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = points[points.length - 1].split(',').map(Number)
  return (
    <svg className="scores-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={`0,${height} ${points.join(' ')} ${width},${height}`} className="fill" />
      <polyline points={points.join(' ')} className="line" />
      <circle cx={last[0]} cy={last[1]} r="3" className="last" />
    </svg>
  )
}

export default function ScoreHistory() {
  const navigate = useNavigate()
  const [statTab, setStatTab] = useState<StatTab>('form')
  const [scope, setScope] = useState<ScoreScope>('all')
  const [status, setStatus] = useState<StatusFilter>('any')
  const [sort, setSort] = useState<SortMode>('newest')
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [shareCard, setShareCard] = useState<ScoreCardSummary | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['score-cards', 'scores-redesign'],
    queryFn: () => scoreCardApi.list(100, 0),
  })

  const { data: riflesData } = useQuery({
    queryKey: ['rifles', 'scores-redesign'],
    queryFn: () => gearApi.listRifles(true),
  })

  const { data: pelletsData } = useQuery({
    queryKey: ['pellets', 'scores-redesign'],
    queryFn: () => gearApi.listPellets(true),
  })

  const cards = useMemo(() => data?.items ?? [], [data])
  const rifleNames = useMemo(() => new Map((riflesData?.items ?? []).map((r) => [r.id, `${r.make} ${r.model}`])), [riflesData])
  const pelletNames = useMemo(() => new Map((pelletsData?.items ?? []).map((p) => [p.id, `${p.brand} ${p.model}`])), [pelletsData])

  const sortedByDate = useMemo(
    () => [...cards].sort((a, b) => scoreDate(a).getTime() - scoreDate(b).getTime()),
    [cards],
  )

  const filtered = useMemo(() => {
    const next = cards.filter((card) => {
      const type = cardScope(card)
      if (scope !== 'all' && type !== scope) return false
      if (status !== 'any' && card.verification !== status) return false
      return true
    })
    next.sort((a, b) => {
      if (sort === 'highest') return b.total_score - a.total_score
      if (sort === 'x') return b.x_count - a.x_count
      return scoreDate(b).getTime() - scoreDate(a).getTime()
    })
    return next
  }, [cards, scope, status, sort])

  const groups = useMemo<WeekGroup[]>(() => {
    const map = new Map<string, WeekGroup>()
    for (const card of filtered) {
      const date = scoreDate(card)
      const key = startOfIsoWeek(date).toISOString()
      const group = map.get(key) ?? {
        key,
        label: weekLabel(date),
        count: 0,
        best: 0,
        items: [],
      }
      group.count += 1
      group.best = Math.max(group.best, card.total_score)
      group.items.push(card)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered])

  const counts = useMemo(() => {
    const base = { all: cards.length, personal: 0, league: 0, club: 0 }
    for (const card of cards) base[cardScope(card)] += 1
    return base
  }, [cards])

  const stats = useMemo(() => {
    const last8 = sortedByDate.slice(-8)
    const last4 = sortedByDate.slice(-4)
    const prev4 = sortedByDate.slice(-8, -4)
    const avg = (items: ScoreCardSummary[]) => items.length ? items.reduce((s, c) => s + c.total_score, 0) / items.length : 0
    const trend = last4.length && prev4.length ? avg(last4) - avg(prev4) : null
    const best = sortedByDate.reduce<ScoreCardSummary | null>((acc, c) => !acc || c.total_score > acc.total_score ? c : acc, null)
    const bestDelta = best ? previousPbDelta(best, sortedByDate) : null
    const avgX = cards.length ? cards.reduce((sum, c) => sum + c.x_count, 0) / cards.length : null
    return { last8, trend, best, bestDelta, avgX }
  }, [cards, sortedByDate])

  const equipmentStats = useMemo(() => {
    function rollup(kind: 'rifle' | 'pellet') {
      const map = new Map<string, { id: string; label: string; count: number; total: number; best: number }>()
      for (const card of cards) {
        const id = kind === 'rifle' ? card.rifle_id : card.pellet_id
        if (!id) continue
        const label = kind === 'rifle' ? rifleNames.get(id) ?? 'Unknown rifle' : pelletNames.get(id) ?? 'Unknown pellet'
        const row = map.get(id) ?? { id, label, count: 0, total: 0, best: 0 }
        row.count += 1
        row.total += card.total_score
        row.best = Math.max(row.best, card.total_score)
        map.set(id, row)
      }
      return [...map.values()].sort((a, b) => b.best - a.best).slice(0, 4)
    }
    return { rifles: rollup('rifle'), pellets: rollup('pellet') }
  }, [cards, pelletNames, rifleNames])

  function toggleCompare(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 2) return [current[1], id]
      return [...current, id]
    })
  }

  function startCompare() {
    setCompareMode((value) => !value)
    setSelected([])
  }

  function goCompare() {
    if (selected.length !== 2) return
    navigate({ to: '/scores/compare', search: { a: selected[0], b: selected[1] } })
  }

  function exportCsv() {
    const headers = ['id', 'date', 'time', 'type', 'status', 'score', 'x_count', 'rifle', 'pellet', 'location', 'source']
    const escape = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = filtered.map((card) => {
      const date = scoreDate(card)
      return [
        card.id,
        date.toISOString().slice(0, 10),
        scoreTime(card),
        cardScope(card),
        card.verification,
        card.total_score,
        card.x_count,
        card.rifle_id ? rifleNames.get(card.rifle_id) ?? card.rifle_id : '',
        card.pellet_id ? pelletNames.get(card.pellet_id) ?? card.pellet_id : '',
        card.location ?? '',
        card.league_name ?? '',
      ].map(escape).join(',')
    })
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sub12-scores-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function shareText(card: ScoreCardSummary): string {
    const suffix = card.x_count > 0 ? ` (${card.x_count}X)` : ''
    const place = card.location ? ` at ${card.location}` : ''
    return `Score card: ${card.total_score}${suffix}${place}`
  }

  return (
    <div className="scores-page">
      <div className="scores-container">
        <header className="scores-header">
          <div>
            <p className="scores-eyebrow">Your cards</p>
            <div className="scores-title-row">
              <h1>My Cards</h1>
              <HelpIcon content={pageHelp.scores} />
            </div>
          </div>
          <div className="scores-actions">
            <button type="button" className={`scores-btn ghost ${compareMode ? 'active' : ''}`} onClick={startCompare}>
              <Grid2X2 size={14} />
              Compare
            </button>
            <button type="button" className="scores-btn ghost" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download size={14} />
              Export
            </button>
            <Link to="/scores/new" className="scores-btn primary">
              <Plus size={14} />
              Log card
            </Link>
          </div>
        </header>

        <section className="scores-performance">
          <div className="scores-panel-head">
            <span>Performance</span>
            <div className="scores-tablist">
              {(['form', 'rifles', 'pellets'] as const).map((tab) => (
                <button key={tab} type="button" className={statTab === tab ? 'active' : ''} onClick={() => setStatTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>
          </div>
          {statTab === 'form' && (
            <div className="scores-stat-grid">
              <div className="scores-stat-cell wide">
                <span>Last 8</span>
                <Sparkline values={stats.last8.map((c) => c.total_score)} />
              </div>
              <div className="scores-stat-cell">
                <span>Trend</span>
                <strong className={stats.trend == null ? '' : stats.trend >= 0 ? 'up' : 'down'}>
                  {stats.trend == null ? '-' : `${stats.trend >= 0 ? '+' : ''}${stats.trend.toFixed(1)}`}
                </strong>
                <small>vs previous 4 cards</small>
              </div>
              <div className="scores-stat-cell">
                <span>Personal best</span>
                <strong className="gold">{stats.best?.total_score ?? '-'}</strong>
                <small>{stats.best ? `${dayLabel(stats.best)}${stats.bestDelta ? ` - +${stats.bestDelta} over previous` : ''}` : 'no cards yet'}</small>
              </div>
              <div className="scores-stat-cell">
                <span>Avg X / card</span>
                <strong>{stats.avgX == null ? '-' : stats.avgX.toFixed(1)}</strong>
                <small>across {cards.length} cards</small>
              </div>
            </div>
          )}
          {statTab !== 'form' && (
            <div className="scores-equipment-list">
              {(statTab === 'rifles' ? equipmentStats.rifles : equipmentStats.pellets).length === 0 && (
                <p>No {statTab} linked to cards yet.</p>
              )}
              {(statTab === 'rifles' ? equipmentStats.rifles : equipmentStats.pellets).map((row) => (
                <div key={row.id} className="scores-equipment-row">
                  <span>{row.label}</span>
                  <strong>{(row.total / row.count).toFixed(1)}</strong>
                  <small>{row.count} cards - best {row.best}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="scores-filterbar">
          <div className="scores-filter-chips">
            {[
              { value: 'all' as const, label: 'All', icon: Grid2X2 },
              { value: 'personal' as const, label: 'Personal', icon: Target },
              { value: 'league' as const, label: 'League', icon: Trophy },
              { value: 'club' as const, label: 'Club', icon: Users },
            ].map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" className={scope === value ? 'active' : ''} onClick={() => setScope(value)}>
                <Icon size={13} />
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="scores-select">
            <BarChart3 size={13} />
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="any">Any status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown size={13} />
          </label>
          <label className="scores-select">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="newest">Newest</option>
              <option value="highest">Highest score</option>
              <option value="x">Most X</option>
            </select>
            <ChevronDown size={13} />
          </label>
        </div>

        {compareMode && (
          <div className="scores-compare-banner">
            <span>{selected.length}/2 selected</span>
            <button type="button" onClick={goCompare} disabled={selected.length !== 2}>Compare these two</button>
          </div>
        )}

        {isLoading && (
          <div className="scores-stream">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="scores-row skeleton" />)}
          </div>
        )}

        {isError && <p className="scores-error">Failed to load score cards.</p>}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="scores-empty">
            <Target size={36} />
            <h2>No cards in this scope.</h2>
            <p>Try a different filter, or log a new card.</p>
            <Link to="/scores/new" className="scores-btn primary"><Plus size={14} /> Log card</Link>
          </div>
        )}

        {groups.length > 0 && (
          <div className="scores-stream">
            {groups.map((group) => (
              <section key={group.key} className="scores-week">
                <header>
                  <h2>{group.label}</h2>
                  <span>{group.count} card{group.count === 1 ? '' : 's'} - best {group.best}</span>
                </header>
                <div className="scores-week-list">
                  {group.items.map((card) => {
                    const selectedForCompare = selected.includes(card.id)
                    const pb = isPersonalBest(card, sortedByDate)
                    const trend = trendFor(card, sortedByDate)
                    const rejected = card.verification === 'rejected'
                    const rifle = card.rifle_id ? rifleNames.get(card.rifle_id) ?? 'Rifle linked' : 'No rifle'
                    const pellet = card.pellet_id ? pelletNames.get(card.pellet_id) ?? 'Pellet linked' : 'No pellet'

                    return (
                      <div key={card.id} className={`scores-row ${pb ? 'is-pb' : ''} ${rejected ? 'is-rejected' : ''} ${selectedForCompare ? 'is-selected' : ''}`}>
                        <button
                          type="button"
                          className={`scores-row-select ${compareMode ? 'visible' : ''} ${selectedForCompare ? 'checked' : ''}`}
                          onClick={() => toggleCompare(card.id)}
                          aria-label={selectedForCompare ? 'Remove from compare' : 'Add to compare'}
                        >
                          {selectedForCompare && <Check size={12} />}
                        </button>
                        <Link to="/scores/$id" params={{ id: card.id }} className="scores-row-main">
                          <MiniTarget card={card} selected={selectedForCompare} />
                          <div className="scores-row-copy">
                            <div className="scores-row-line">
                              <strong>{dayLabel(card)}</strong>
                              <span className="mono">{scoreTime(card)}</span>
                              <TypeChip card={card} />
                              {cardScope(card) === 'league' && <StatusPill status={card.verification} />}
                              {pb && <span className="scores-pb">PB</span>}
                            </div>
                            <div className="scores-row-meta">
                              <span>{rifle}</span>
                              <span>{pellet}</span>
                              {card.location && <span>{card.location}</span>}
                              {card.league_name && <span className="gold">{card.league_name}</span>}
                            </div>
                          </div>
                          <div className="scores-row-score">
                            <strong>{card.total_score}</strong>
                            <span>{card.x_count}x</span>
                            <small className={trend == null ? '' : trend >= 0 ? 'up' : 'down'}>
                              {trend == null ? 'no avg yet' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)} vs avg`}
                            </small>
                          </div>
                        </Link>
                        <div className="scores-row-actions">
                          <Link to="/scores/$id" params={{ id: card.id }} aria-label="View card"><Eye size={14} /></Link>
                          <button type="button" aria-label="Share card" onClick={() => setShareCard(card)}><Share2 size={14} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {shareCard && (
          <ShareDialog
            targetId={shareCard.id}
            targetType="score_card"
            targetLabel="Score Card"
            shareTitle={`Score card - ${shareCard.total_score}`}
            shareText={shareText(shareCard)}
            onClose={() => setShareCard(null)}
          />
        )}
      </div>
    </div>
  )
}
