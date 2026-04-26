import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Target } from 'lucide-react'
import { scoreCardApi, ScoreCard } from '../api/scoreCards'
import { gearApi } from '../api/gear'
import './scores.css'

function dateLabel(card?: ScoreCard): string {
  if (!card) return '-'
  return new Date(card.shot_at).toLocaleDateString('en-GB')
}

function cardType(card?: ScoreCard): string {
  if (!card) return '-'
  if (card.league_id || card.league_round_id || card.league_name) return 'League'
  if (card.club_id) return 'Club'
  return 'Personal'
}

function cardTypeClass(card?: ScoreCard): string {
  return cardType(card).toLowerCase()
}

function avg(card?: ScoreCard): string {
  if (!card) return '-'
  return (card.total_score / 25).toFixed(2)
}

function TargetViz({ card }: { card?: ScoreCard }) {
  const points = (card?.shot_scores ?? []).map((score, index) => {
    const seed = card ? card.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) : 1
    const quality = Math.max(0.08, Math.min(0.9, (10 - score) / 8))
    const angle = ((seed + index * 19) % 360) * Math.PI / 180
    const dist = quality * 95
    return {
      x: 150 + Math.cos(angle) * dist,
      y: 150 + Math.sin(angle) * dist,
      xring: Boolean(card?.shot_xs?.[index]),
    }
  })

  return (
    <svg className="scores-target-large" viewBox="0 0 300 300" aria-hidden="true">
      {[132, 108, 84, 60, 36].map((r) => <circle key={r} cx="150" cy="150" r={r} />)}
      <circle className="bull" cx="150" cy="150" r="18" />
      {points.map((point, index) => (
        <circle key={index} className="shot" cx={point.x} cy={point.y} r={point.xring ? 5 : 4} style={{ fill: point.xring ? 'var(--gold)' : undefined }} />
      ))}
    </svg>
  )
}

function CompareRow({
  metric,
  a,
  b,
  numeric = false,
}: {
  metric: string
  a: string | number
  b: string | number
  numeric?: boolean
}) {
  const aNum = typeof a === 'number' ? a : Number.NaN
  const bNum = typeof b === 'number' ? b : Number.NaN
  const aWins = numeric && Number.isFinite(aNum) && Number.isFinite(bNum) && aNum > bNum
  const bWins = numeric && Number.isFinite(aNum) && Number.isFinite(bNum) && bNum > aNum
  return (
    <div className="scores-compare-row">
      <span className={aWins ? 'win' : ''}>{a}</span>
      <span className="metric">{metric}</span>
      <span className={bWins ? 'win' : ''}>{b}</span>
    </div>
  )
}

export default function ScoreCompare() {
  const search = useSearch({ strict: false }) as { a?: string; b?: string }
  const aId = search.a
  const bId = search.b

  const { data: aCard, isLoading: aLoading } = useQuery({
    queryKey: ['score-card', aId],
    queryFn: () => scoreCardApi.get(aId!),
    enabled: Boolean(aId),
  })
  const { data: bCard, isLoading: bLoading } = useQuery({
    queryKey: ['score-card', bId],
    queryFn: () => scoreCardApi.get(bId!),
    enabled: Boolean(bId),
  })
  const { data: riflesData } = useQuery({
    queryKey: ['rifles', 'score-compare'],
    queryFn: () => gearApi.listRifles(true),
  })
  const { data: pelletsData } = useQuery({
    queryKey: ['pellets', 'score-compare'],
    queryFn: () => gearApi.listPellets(true),
  })

  const rifleName = (id?: string) => riflesData?.items.find((r) => r.id === id)
    ? `${riflesData.items.find((r) => r.id === id)!.make} ${riflesData.items.find((r) => r.id === id)!.model}`
    : '-'
  const pelletName = (id?: string) => pelletsData?.items.find((p) => p.id === id)
    ? `${pelletsData.items.find((p) => p.id === id)!.brand} ${pelletsData.items.find((p) => p.id === id)!.model}`
    : '-'

  const loading = aLoading || bLoading

  return (
    <div className="scores-page">
      <div className="scores-container">
        <header className="scores-compare-header">
          <div>
            <Link to="/scores" className="scores-compare-back"><ArrowLeft size={15} /> Back to cards</Link>
            <p className="scores-eyebrow">Scores</p>
            <h1 className="t-page-title">Compare cards</h1>
          </div>
        </header>

        {!aId || !bId ? (
          <div className="scores-empty">
            <Target size={36} />
            <h2 className="t-subsection-title">Select two cards</h2>
            <p>Use compare mode from the scores list.</p>
            <Link to="/scores" className="scores-btn primary">Back to scores</Link>
          </div>
        ) : loading ? (
          <div className="scores-stream">
            <div className="scores-row skeleton" />
            <div className="scores-row skeleton" />
          </div>
        ) : (
          <>
            <div className="scores-compare-grid">
              {[aCard, bCard].map((card, index) => (
                <section key={card?.id ?? index} className="scores-compare-card">
                  <div className="scores-row-line">
                    <h2>{dateLabel(card)}</h2>
                    <span className={`scores-chip ${cardTypeClass(card)}`}>{cardType(card)}</span>
                    {card?.verification && card.verification !== 'none' && <span className={`scores-status ${card.verification}`}>{card.verification}</span>}
                  </div>
                  <div className="score">{card?.total_score ?? '-'}</div>
                  <div className="scores-row-meta">
                    <span>{card?.x_count ?? 0}x</span>
                    <span>{avg(card)} avg</span>
                  </div>
                  <TargetViz card={card} />
                </section>
              ))}
            </div>

            <section className="scores-compare-table">
              <CompareRow metric="Date" a={dateLabel(aCard)} b={dateLabel(bCard)} />
              <CompareRow metric="Score" a={aCard?.total_score ?? '-'} b={bCard?.total_score ?? '-'} numeric />
              <CompareRow metric="X count" a={aCard?.x_count ?? '-'} b={bCard?.x_count ?? '-'} numeric />
              <CompareRow metric="Avg" a={avg(aCard)} b={avg(bCard)} numeric />
              <CompareRow metric="Rifle" a={rifleName(aCard?.rifle_id)} b={rifleName(bCard?.rifle_id)} />
              <CompareRow metric="Pellet" a={pelletName(aCard?.pellet_id)} b={pelletName(bCard?.pellet_id)} />
              <CompareRow metric="Distance" a={aCard?.location ?? '-'} b={bCard?.location ?? '-'} />
              <CompareRow metric="Wind" a={aCard?.wind_mph != null ? `${aCard.wind_mph} mph` : '-'} b={bCard?.wind_mph != null ? `${bCard.wind_mph} mph` : '-'} />
              <CompareRow metric="Temp" a={aCard?.temp_celsius != null ? `${aCard.temp_celsius} C` : '-'} b={bCard?.temp_celsius != null ? `${bCard.temp_celsius} C` : '-'} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
