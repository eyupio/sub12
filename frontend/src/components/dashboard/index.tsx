import { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react'

// ─── Avatar slots ────────────────────────────────────────────────────────────

export type AvatarSlot = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'

const slotGradients: Record<AvatarSlot, string> = {
  a1: 'linear-gradient(135deg, #b88a35, #d9b878)',
  a2: 'linear-gradient(135deg, #4a5a3a, #6a7a4a)',
  a3: 'linear-gradient(135deg, #3a3a42, #555560)',
  a4: 'linear-gradient(135deg, #7a4a35, #b07050)',
  a5: 'linear-gradient(135deg, #355a6a, #5085a0)',
  a6: 'linear-gradient(135deg, #6a3a55, #9a5580)',
}

function pickSlot(seed?: string): AvatarSlot {
  if (!seed) return 'a1'
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const slots: AvatarSlot[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
  return slots[h % slots.length]
}

function initialsOf(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function Avatar({
  name,
  imageUrl,
  size = 28,
  slot,
}: {
  name?: string
  imageUrl?: string | null
  size?: 22 | 28 | 36 | 40 | 44 | number
  slot?: AvatarSlot
}) {
  const resolvedSlot = slot ?? pickSlot(name)
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ''}
        className="rounded-full object-cover border border-line shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-label={name ?? ''}
      className="inline-flex items-center justify-center rounded-full text-white font-medium select-none shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.36)),
        background: slotGradients[resolvedSlot],
      }}
    >
      {initialsOf(name)}
    </span>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode
  variant?: 'gold' | 'green' | 'red' | 'neutral'
}) {
  const cls =
    variant === 'gold'
      ? 'bg-gold-tint text-gold border border-line-2'
      : variant === 'green'
      ? 'bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]'
      : variant === 'red'
      ? 'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red-soft)]'
      : 'bg-surface-2 text-muted border border-line'
  return (
    <span
      className={`inline-flex items-center px-1.5 py-[2px] rounded text-[10px] tracking-wider uppercase font-medium ${cls}`}
    >
      {children}
    </span>
  )
}

// ─── TrendPill ───────────────────────────────────────────────────────────────

export function TrendPill({
  delta,
  suffix,
  precision = 1,
}: {
  delta: number | null
  suffix?: string
  precision?: number
}) {
  if (delta == null) return null
  const flat = Math.abs(delta) < 0.05
  const sign = flat ? 'flat' : delta > 0 ? 'up' : 'down'
  const Icon = flat ? Minus : sign === 'up' ? ArrowUp : ArrowDown
  const color =
    sign === 'up' ? 'text-[var(--green)]' : sign === 'down' ? 'text-[var(--red)]' : 'text-muted'
  const label = flat
    ? '—'
    : `${delta > 0 ? '+' : ''}${delta.toFixed(precision)}${suffix ? ` ${suffix}` : ''}`
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${color}`}>
      <Icon size={11} strokeWidth={1.75} />
      <span>{label}</span>
    </span>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

export function Section({
  title,
  icon,
  actions,
  children,
}: {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-surface border border-line rounded-[10px] shadow-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-[18px] py-[14px] border-b border-line">
        <h2 className="flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase text-muted">
          {icon}
          {title}
        </h2>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function SectionAction({
  to,
  children,
  variant = 'gold',
  icon,
}: {
  to: string
  children: ReactNode
  variant?: 'gold' | 'outline'
  icon?: ReactNode
}) {
  const cls =
    variant === 'outline'
      ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded border border-line text-muted hover:text-ink hover:border-line-2 transition-colors text-[10px] tracking-[0.18em] uppercase font-medium'
      : 'inline-flex items-center gap-1 text-[10px] tracking-[0.18em] uppercase text-gold hover:text-gold-2 transition-colors font-medium'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Link to={to as any} className={cls}>{icon}{children}</Link>
}

// ─── StatTile ────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  unit,
  sub,
  subVariant,
  trend,
  gold,
  compact,
  to,
  params,
  search,
}: {
  label: string
  value: string
  unit?: string
  sub?: ReactNode
  subVariant?: 'up' | 'down' | 'flat'
  trend?: ReactNode
  gold?: boolean
  compact?: boolean
  to?: string
  params?: Record<string, string>
  search?: Record<string, string | undefined>
}) {
  const subColor =
    subVariant === 'up'
      ? 'text-[var(--green)]'
      : subVariant === 'down'
      ? 'text-[var(--red)]'
      : 'text-muted'
  const valueClass = compact
    ? 'text-[18px] leading-tight font-medium'
    : 'font-serif-display text-[32px] leading-none font-medium tracking-tight'
  const valueColor = gold ? 'text-gold' : 'text-ink'

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] tracking-[0.16em] uppercase text-muted">{label}</p>
        {to && <ChevronRight size={12} className="text-muted-2 shrink-0 mt-0.5" />}
      </div>
      <p className={`${valueClass} ${valueColor} mt-1.5 truncate`}>
        {value}
        {unit && (
          <span className="font-mono text-[14px] text-muted ml-0.5 align-baseline">{unit}</span>
        )}
      </p>
      {sub && (
        <p className={`text-[11px] font-mono mt-1.5 ${subColor}`}>
          {sub}
        </p>
      )}
      {trend && <div className="mt-1.5">{trend}</div>}
    </>
  )

  const baseClass =
    'bg-surface border border-line rounded-[10px] p-4 shadow-card flex flex-col min-w-0'
  const linkClass = `${baseClass} hover:-translate-y-px hover:shadow-card-hover hover:border-line-2 transition-all duration-150`

  if (to) {
    return (
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params={params as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search={search as any}
        className={linkClass}
      >
        {inner}
      </Link>
    )
  }
  return <div className={baseClass}>{inner}</div>
}

// ─── RifleCard ───────────────────────────────────────────────────────────────

export function RifleCard({
  name,
  spec,
  imageUrl,
  cardsLogged,
  shotsFired,
  bestScore,
  bestXCount,
  hasData,
  slot,
  to,
  params,
}: {
  name: string
  spec?: string
  imageUrl?: string
  cardsLogged: number | null
  shotsFired: number | null
  bestScore: number | null
  bestXCount: number | null
  hasData: boolean
  slot?: AvatarSlot
  to?: string
  params?: Record<string, string>
}) {
  const dash = '—'
  const fmt = (v: number | null) => (v == null ? dash : String(v))
  const resolvedSlot = slot ?? pickSlot(name)

  const inner = (
    <div className="flex flex-col items-center text-center gap-3 px-4 py-5">
      <p className="text-[10px] tracking-[0.20em] uppercase text-gold">Rifle Profile</p>
      <div
        className="w-[90px] h-[90px] rounded-full border border-line overflow-hidden flex items-center justify-center shrink-0"
        style={{
          background: imageUrl ? undefined : slotGradients[resolvedSlot],
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-serif-display text-[28px]">{initialsOf(name)}</span>
        )}
      </div>
      <div>
        <p className="font-serif-display text-[18px] text-ink leading-tight">{name}</p>
        {spec && <p className="font-mono text-[11px] text-muted mt-0.5">{spec}</p>}
      </div>
      <div className="w-full border-t border-line pt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="text-muted">Cards Logged</span>
          <span className={`font-mono ${hasData ? 'text-ink' : 'text-muted-2'}`}>
            {fmt(cardsLogged)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Shots Fired</span>
          <span className={`font-mono ${hasData ? 'text-ink' : 'text-muted-2'}`}>
            {fmt(shotsFired)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Best Score</span>
          <span className={`font-mono ${hasData && bestScore != null ? 'text-gold' : 'text-muted-2'}`}>
            {fmt(bestScore)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Best X Count</span>
          <span className={`font-mono ${hasData ? 'text-ink' : 'text-muted-2'}`}>
            {fmt(bestXCount)}
          </span>
        </div>
      </div>
    </div>
  )

  if (to) {
    return (
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params={params as any}
        className="block hover:bg-surface-2 transition-colors"
      >
        {inner}
      </Link>
    )
  }
  return inner
}

// ─── ActivityRow ─────────────────────────────────────────────────────────────

export type ActivityScoreItem = {
  kind: 'score'
  id: string
  date: string
  score: number
  x: number
  delta: number | null
  to: string
}

export type ActivityPostItem = {
  kind: 'post'
  id: string
  who: string
  whoId?: string
  avatarUrl?: string
  whereName?: string
  whereType?: 'league' | 'club'
  whereId?: string
  date: string
  score?: number
  x?: number
  body?: string
  likeCount?: number
  commentCount?: number
}

export type ActivityItem = ActivityScoreItem | ActivityPostItem

export function ActivityRow({
  item,
  scoreIcon,
  formatRelative,
}: {
  item: ActivityItem
  scoreIcon: ReactNode
  formatRelative: (iso: string) => string
}) {
  if (item.kind === 'score') {
    const deltaSign =
      item.delta == null
        ? 'flat'
        : Math.abs(item.delta) < 0.5
        ? 'flat'
        : item.delta > 0
        ? 'up'
        : 'down'
    const deltaColor =
      deltaSign === 'up'
        ? 'text-[var(--green)] bg-[var(--green-soft)]'
        : deltaSign === 'down'
        ? 'text-[var(--red)] bg-[var(--red-soft)]'
        : 'text-muted bg-surface-2'
    const deltaLabel =
      item.delta == null || deltaSign === 'flat'
        ? null
        : `${item.delta > 0 ? '+' : ''}${item.delta.toFixed(1)} vs avg`

    return (
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={item.to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params={{ id: item.id } as any}
        className="flex items-center gap-3 px-[18px] py-3 border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-gold-tint text-gold inline-flex items-center justify-center shrink-0">
          {scoreIcon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">
            You logged a card · <span className="font-mono">{formatRelative(item.date)}</span>
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-[18px] font-semibold text-ink">{item.score}</span>
            {item.x > 0 && (
              <span className="font-mono text-[12px] text-gold">{item.x}X</span>
            )}
            {deltaLabel && (
              <span className={`font-mono text-[10px] px-1.5 py-[1px] rounded ${deltaColor}`}>
                {deltaLabel}
              </span>
            )}
          </div>
        </div>
      </Link>
    )
  }

  // kind === 'post'
  const wherePath =
    item.whereType === 'league' && item.whereId
      ? `/leagues/${item.whereId}`
      : item.whereType === 'club' && item.whereId
      ? `/clubs/${item.whereId}`
      : null

  return (
    <div className="flex items-start gap-3 px-[18px] py-3 border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors">
      <Avatar name={item.who} imageUrl={item.avatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted">
          <span className="font-medium text-ink-2">{item.who}</span>
          {' posted '}
          {item.score != null ? 'a new card' : ''}
          {item.whereName && wherePath && (
            <>
              {' in '}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Link to={wherePath as any} className="text-gold hover:text-gold-2 transition-colors">
                {item.whereName}
              </Link>
            </>
          )}
          {' · '}
          <span className="font-mono">{formatRelative(item.date)}</span>
        </p>
        {item.score != null ? (
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-[18px] font-semibold text-ink">{item.score}</span>
            {item.x != null && item.x > 0 && (
              <span className="font-mono text-[12px] text-gold">{item.x}X</span>
            )}
            {item.body && (
              <span className="text-[12px] text-muted truncate">{item.body}</span>
            )}
          </div>
        ) : (
          item.body && <p className="text-[13px] text-ink-2 mt-1 leading-snug">{item.body}</p>
        )}
      </div>
    </div>
  )
}

// ─── NoticeCard ──────────────────────────────────────────────────────────────

export function NoticeCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: ReactNode
  title: string
  body: string
  cta?: { label: string; to: string; params?: Record<string, string> }
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-[10px] bg-gold-tint border border-line-2">
      <span className="w-8 h-8 rounded-full bg-surface text-gold inline-flex items-center justify-center shrink-0 border border-line">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink leading-snug">{title}</p>
        <p className="text-[11px] text-muted-2 mt-1 leading-relaxed">{body}</p>
        {cta && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link to={cta.to as any} params={cta.params as any} className="mt-2 inline-block text-[10px] tracking-[0.18em] uppercase text-gold hover:text-gold-2 font-medium">
            {cta.label} →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── PelletCell + StatsStrip ─────────────────────────────────────────────────

export type PelletCellData = {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}

export function StatsStrip({ cells }: { cells: PelletCellData[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-line border border-line rounded-[10px] bg-surface overflow-hidden">
      {cells.map((c, i) => (
        <div key={i} className={`px-4 py-4 ${i >= 2 ? 'border-t lg:border-t-0 border-line' : ''}`}>
          <p className="text-[10px] tracking-[0.18em] uppercase text-muted">{c.label}</p>
          <p className={`font-serif-display text-[24px] mt-1 leading-tight ${c.highlight ? 'text-gold' : 'text-ink'}`}>
            {c.value}
          </p>
          {c.sub && <p className="text-[11px] text-muted mt-1">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ─── MiniEntityCard ──────────────────────────────────────────────────────────

export function MiniEntityCard({
  name,
  imageUrl,
  metaIcon,
  metaLabel,
  rank,
  total,
  to,
  params,
  thumbIcon,
  slot,
}: {
  name: string
  imageUrl?: string
  metaIcon?: ReactNode
  metaLabel?: string
  rank?: number
  total?: number
  to: string
  params?: Record<string, string>
  thumbIcon?: ReactNode
  slot?: AvatarSlot
}) {
  const resolvedSlot = slot ?? pickSlot(name)

  const inner = (
    <>
      <div
        className="w-10 h-10 rounded-[8px] border border-line shrink-0 overflow-hidden flex items-center justify-center"
        style={{ background: imageUrl ? undefined : slotGradients[resolvedSlot] }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white">{thumbIcon ?? initialsOf(name)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink truncate">{name}</p>
        {metaLabel && (
          <p className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
            {metaIcon}
            {metaLabel}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {rank != null && rank > 0 ? (
          <p className="font-mono text-[11px] text-muted">
            <span className="font-serif-display text-[16px] text-gold leading-none">
              {ordinalNumber(rank)}
            </span>
            <sup className="ml-0.5">{ordinalSuffix(rank)}</sup>
            {total ? <span className="ml-1">/{total}</span> : null}
          </p>
        ) : (
          <ChevronRight size={14} className="text-muted-2" />
        )}
      </div>
    </>
  )
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params={params as any}
      className="flex items-center gap-3 px-[14px] py-3 border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors"
    >
      {inner}
    </Link>
  )
}

function ordinalNumber(n: number): string {
  return String(n)
}

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}
