import { ReactNode } from 'react'

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export default function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-6 ${className ?? ''}`}>
      <div className="min-w-0">
        <h1 className="t-page-title">{title}</h1>
        {subtitle && <p className="t-page-subtitle mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
