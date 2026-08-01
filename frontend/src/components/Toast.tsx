import { useState } from 'react'
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

// The countdown bar reuses the toast's own text colour so it reads as part of
// the same object rather than a separate progress widget.
const bars: Record<ToastVariant, string> = {
  success: 'bg-[var(--success-text)]',
  error: 'bg-[var(--error-text)]',
  info: 'bg-[var(--brass)]',
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const pauseToast = useToastStore((s) => s.pauseToast)
  const resumeToast = useToastStore((s) => s.resumeToast)
  // Hovering pauses the dismiss timer; freezing the bar keeps the visual in
  // step with the timer instead of running out while the toast stays put.
  const [paused, setPaused] = useState<string | null>(null)

  if (toasts.length === 0) return null

  return (
    // Toasts are the app's only channel for the outcome of an action, and
    // plenty of those actions are started from inside a dialog (submitting a
    // card to a league, flagging a post). At a layer below the dialogs they
    // landed behind the backdrop, blurred and unreadable, so the failure looked
    // like nothing happening. This has to stay above every overlay in the app —
    // see the layer stack in CLAUDE.md; Toast.test.tsx pins it.
    <div
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[22rem] z-[150] space-y-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = icons[t.variant]
        const isPaused = paused === t.id
        return (
          <div
            key={t.id}
            role="alert"
            onMouseEnter={() => { pauseToast(t.id); setPaused(t.id) }}
            onMouseLeave={() => { resumeToast(t.id); setPaused((p) => (p === t.id ? null : p)) }}
            className={`pointer-events-auto relative overflow-hidden flex items-start gap-2.5 pl-4 pr-3 py-3 rounded-lg border shadow-float text-sm tracking-wide animate-scale-in ${colours[t.variant]}`}
          >
            <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-current/10">
              <Icon size={14} />
            </span>
            <span className="flex-1 min-w-0 leading-snug">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 u-press transition-opacity no-min-target"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-0 h-[2px] opacity-50 ${bars[t.variant]}`}
              style={{
                animation: `toast-countdown ${t.duration}ms linear forwards`,
                animationPlayState: isPaused ? 'paused' : 'running',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
