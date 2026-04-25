import { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Users, ChevronRight, Trophy } from 'lucide-react'
import { Avatar, TypeTag } from './atoms'
import { DisciplineThumb } from './structure'
import { ordinal, type Discipline } from './tokens'

export type MetaItem = {
  icon?: ReactNode
  text: ReactNode
}

export type PodiumItem = {
  rank: number
  name: string
  score: number
  x?: number
}

export type EntityCardProps = {
  to: string
  toParams: Record<string, string>
  thumbType?: Discipline
  thumbIcon?: ReactNode
  thumbImage?: string | null
  name: string
  typeTag?: Discipline
  badges?: ReactNode
  meta: MetaItem[]
  podium?: PodiumItem[]
  rightRail?: 'rank' | 'chevron' | 'none'
  rank?: { position: number; total: number; best?: number; bestX?: number } | null
  size?: 'default' | 'small'
}

export function EntityCard(props: EntityCardProps) {
  const {
    to,
    toParams,
    thumbType,
    thumbIcon,
    thumbImage,
    name,
    typeTag,
    badges,
    meta,
    podium,
    rightRail = 'chevron',
    rank,
    size = 'default',
  } = props

  const small = size === 'small'

  const thumb = thumbImage ? (
    <img
      src={thumbImage}
      alt={name}
      className={small ? 'lc-entity-thumb-sm' : 'lc-entity-thumb'}
      style={{ objectFit: 'cover' }}
    />
  ) : (
    <DisciplineThumb type={thumbType} size={small ? 44 : 64} icon={thumbIcon ?? <Trophy size={small ? 18 : 24} />} />
  )

  return (
    <Link
      to={to}
      params={toParams as never}
      className="lc-entity-card"
      style={small ? { gridTemplateColumns: '44px 1fr auto', padding: 12 } : undefined}
    >
      {thumb}
      <div className="lc-entity-body">
        <div className="lc-entity-row1">
          <span className="lc-entity-name">{name}</span>
          {typeTag && <TypeTag type={typeTag} />}
          {badges}
        </div>
        {meta.length > 0 && (
          <div className="lc-entity-meta">
            {meta.map((m, i) => (
              <span key={i} className="lc-entity-meta-item">
                {m.icon}
                <span>{m.text}</span>
              </span>
            ))}
          </div>
        )}
        {podium && podium.length > 0 && (
          <div className="lc-podium-mini">
            {podium.map((p) => (
              <span className="lc-podium-pill" key={p.rank}>
                <Avatar name={p.name} size="sm" />
                <span className="lc-podium-rank">{p.rank}</span>
                <span className="lc-podium-score">
                  {p.score}
                  {p.x ? <span style={{ color: 'var(--gold)', marginLeft: 4 }}>{p.x}X</span> : null}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="lc-rank-rail">
        {rightRail === 'rank' && rank && rank.position > 0 ? (
          <>
            <div>
              <span className="lc-rank-pos">{rank.position}</span>
              <sup className="lc-rank-sup" style={{ color: 'var(--gold)' }}>{ordinal(rank.position)}</sup>
              <span className="lc-rank-divider"> / {rank.total}</span>
            </div>
            {rank.best != null && (
              <div className="lc-rank-best">
                {rank.best}
                {rank.bestX != null && <span className="lc-rank-best-x">{rank.bestX}X</span>}
              </div>
            )}
          </>
        ) : rightRail === 'chevron' ? (
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        ) : null}
      </div>
    </Link>
  )
}

export { Users }
