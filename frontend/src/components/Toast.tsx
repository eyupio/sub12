import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToastStore, ToastVariant } from '../store/toast'

const icons: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

const colours: Record<ToastVariant, string> = {
  success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]',
  error: 'bg-[var(--error-bg)] border-[var(--error-border)] text-[var(--error-text)]',
  info: 'bg-surface border-[var(--brass)]/40 text-secondary',
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-80 z-[100] space-y-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = icons[t.variant]
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-lg border shadow-lg text-sm tracking-wide animate-slide-in ${colours[t.variant]}`}
          >
            <Icon size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
