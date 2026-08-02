import { ReactNode, useEffect } from 'react'
import { Search, ChevronLeft } from 'lucide-react'
import { haptics } from '../../utils/haptics'
import { disciplineCover, type Discipline } from './tokens'
import './styles.css'

export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`lc-page ${className ?? ''}`}><div className="lc-container">{children}</div></div>
}

export function PageHeader({
  title,
  info,
  description,
  action,
}: {
  title: string
  info?: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="lc-page-header">
      <div className="lc-page-titlebar">
        <div className="lc-page-title">
          <h1 className="t-page-title">{title}</h1>
          {info}
        </div>
        {description && <p className="lc-page-description">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function FilterRow<T extends string>({
  search,
  onSearch,
  onSubmit,
  placeholder = 'Search…',
  chips,
  activeChip,
  onChip,
}: {
  search: string
  onSearch: (v: string) => void
  onSubmit?: () => void
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
          onKeyDown={onSubmit ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } } : undefined}
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
              onClick={() => { haptics.tapLight(); onChip?.(c.value) }}
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
  id,
  title,
  icon,
  actions,
  tabs,
  children,
  noPad = false,
}: {
  id?: string
  title?: string
  icon?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
  noPad?: boolean
}) {
  return (
    <section id={id} className="lc-section" style={id ? { scrollMarginTop: 72 } : undefined}>
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
          onClick={() => { haptics.tapLight(); onChange(t.value) }}
        >
          {t.label}
          {t.count != null && <span className="lc-tab-pill">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Row placeholders sized for the tables and member lists that live inside
 * <Section>. Standing in for the real rows keeps the panel at roughly its
 * final height, so the page doesn't reflow when the query resolves.
 */
export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={`lc-loading-rows ${className ?? ''}`} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="lc-loading-row">
          <span className="skeleton lc-loading-avatar" />
          <span className="skeleton lc-loading-name" />
          <span className="skeleton lc-loading-value" />
        </div>
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
  // For standard sizes the dimensions come from CSS so mobile breakpoints can
  // shrink them; only override inline for non-standard sizes (e.g. 44).
  const useClassSize = size === 48 || size === 64
  return (
    <div
      className={size <= 48 ? 'lc-detail-thumb' : 'lc-entity-thumb'}
      style={{
        ...(useClassSize ? null : { width: size, height: size }),
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
