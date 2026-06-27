import { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { disciplineTagClass, type Discipline } from './tokens'
import { identiconDataUri } from '../../utils/identicon'

type Size = 'sm' | 'md' | 'lg'

export function Avatar({ name, size = 'md', src }: { name: string; size?: Size; src?: string | null }) {
  const cls = `lc-avatar lc-avatar-${size}`
  return (
    <img
      src={src || identiconDataUri(name)}
      alt={name}
      className={cls}
      style={{ objectFit: 'cover' }}
    />
  )
}

export function Badge({
  variant = 'neutral',
  live = false,
  children,
}: {
  variant?: 'gold' | 'green' | 'red' | 'neutral'
  live?: boolean
  children: ReactNode
}) {
  return (
    <span className={`lc-badge lc-badge-${variant}`}>
      {live && <span className="lc-badge-dot" />}
      {children}
    </span>
  )
}

export function TypeTag({ type }: { type?: Discipline }) {
  if (!type) return null
  return <span className={`lc-type-tag ${disciplineTagClass(type)}`}>{type}</span>
}

export function VisibilityDot({ visibility }: { visibility?: 'public' | 'private' | string | null }) {
  const cls = visibility === 'private' ? 'lc-vdot-private' : 'lc-vdot-public'
  return <span className={`lc-vdot ${cls}`} />
}

export function Trend({ delta }: { delta?: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="lc-trend flat">—</span>
  }
  if (delta > 0) {
    return (
      <span className="lc-trend up">
        <ArrowUp size={12} /> {delta}
      </span>
    )
  }
  return (
    <span className="lc-trend down">
      <ArrowDown size={12} /> {Math.abs(delta)}
    </span>
  )
}

export function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <span className="lc-trend flat">—</span>
  }
  const w = 60
  const h = 20
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = (w - pad * 2) / (values.length - 1)
  const points = values.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const trendUp = values[values.length - 1] >= values[0]
  const color = trendUp ? 'var(--green)' : 'var(--red)'
  const last = points[points.length - 1].split(',').map(Number)
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  )
}
