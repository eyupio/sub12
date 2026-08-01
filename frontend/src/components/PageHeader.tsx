import { ReactNode } from 'react'

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Small uppercase kicker above the title, e.g. a section or breadcrumb. */
  eyebrow?: ReactNode
  /** Leading glyph rendered in a tinted tile beside the title. */
  icon?: ReactNode
  className?: string
}

export default function PageHeader({ title, subtitle, actions, eyebrow, icon, className }: Props) {
  return (
    <div className={`mb-6 animate-fade-in-up ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius)] bg-gold-tint text-gold">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="t-label-caps mb-1">{eyebrow}</p>}
            <h1 className="t-page-title">{title}</h1>
            {subtitle && <p className="t-page-subtitle mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {/* Brass rule that fades out to the right — anchors the header without
          drawing a full-width divider across every page. */}
      <div
        aria-hidden="true"
        className="mt-4 h-px w-full"
        style={{ background: 'linear-gradient(90deg, var(--gold-soft), var(--line) 30%, transparent)' }}
      />
    </div>
  )
}
