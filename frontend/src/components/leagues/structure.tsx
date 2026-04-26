import { ReactNode, useEffect } from 'react'
import { Search, ChevronLeft } from 'lucide-react'
import { disciplineCover, type Discipline } from './tokens'
import './styles.css'

export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`lc-page ${className ?? ''}`}><div className="lc-container">{children}</div></div>
}

export function PageHeader({
  title,
  info,
  action,
}: {
  title: string
  info?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="lc-page-header">
      <div className="lc-page-title">
        <h1 className="t-page-title">{title}</h1>
        {info}
      </div>
      {action}
    </div>
  )
}

export function FilterRow<T extends string>({
  search,
  onSearch,
  placeholder = 'Search…',
  chips,
  activeChip,
  onChip,
}: {
  search: string
  onSearch: (v: string) => void
  placeholder?: string
  chips?: { value: T; label: string }[]
  activeChip?: T
  onChip?: (v: T) => void
}) {
  return (
    <div className="lc-filter-row">
      <div className="lc-search">
        <Search size={14} className="lc-search-icon" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      {chips && chips.length > 0 && (
        <div className="lc-chips">
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`lc-chip ${activeChip === c.value ? 'is-active' : ''}`}
              onClick={() => onChip?.(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Section({
  title,
  icon,
  actions,
  tabs,
  children,
  noPad = false,
}: {
  title?: string
  icon?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
  noPad?: boolean
}) {
  return (
    <section className="lc-section">
      {(title || actions) && (
        <header className="lc-section-head">
          {title && (
            <span className="lc-section-title">
              {icon}
              {title}
            </span>
          )}
          {actions}
        </header>
      )}
      {tabs}
      <div style={noPad ? undefined : { padding: 0 }}>{children}</div>
    </section>
  )
}

export type TabSpec<T extends string> = { value: T; label: string; count?: number | null }

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec<T>[]
  active: T
  onChange: (v: T) => void
}) {
  return (
    <div className="lc-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={active === t.value}
          className={`lc-tab ${active === t.value ? 'is-active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="lc-tab-pill">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon?: ReactNode
  title: string
  body?: string
  cta?: ReactNode
}) {
  return (
    <div className="lc-empty">
      {icon && <div className="lc-empty-icon">{icon}</div>}
      <h3 className="lc-empty-title">{title}</h3>
      {body && <p className="lc-empty-body">{body}</p>}
      {cta}
    </div>
  )
}

export function DisciplineThumb({
  type,
  size = 64,
  icon,
}: {
  type?: Discipline
  size?: number
  icon: ReactNode
}) {
  const g = disciplineCover(type)
  return (
    <div
      className={size <= 48 ? 'lc-detail-thumb' : 'lc-entity-thumb'}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
      }}
    >
      {icon}
    </div>
  )
}

export function EntityDetailHeader({
  onBack,
  thumb,
  title,
  tag,
  sub,
  rightActions,
}: {
  onBack?: () => void
  thumb: ReactNode
  title: string
  tag?: ReactNode
  sub?: ReactNode
  rightActions?: ReactNode
}) {
  // ESC to go back
  useEffect(() => {
    if (!onBack) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onBack])
  return (
    <div className="lc-detail-header">
      {onBack && (
        <button className="lc-icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={16} />
        </button>
      )}
      {thumb}
      <div className="lc-detail-titlebar">
        <h1 className="t-page-title lc-detail-title">
          {title}
          {tag}
        </h1>
        {sub && <div className="lc-detail-sub">{sub}</div>}
      </div>
      {rightActions && (
        <div style={{ display: 'flex', gap: 8 }}>{rightActions}</div>
      )}
    </div>
  )
}
