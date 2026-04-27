import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { WizardStepper, type WizardStepDescriptor } from './WizardStepper'

interface Props {
  steps: WizardStepDescriptor[]
  currentIndex: number
  onJump: (index: number) => void
  onBack?: () => void
  onNext?: () => void
  backLabel?: string
  nextLabel?: string
  nextDisabled?: boolean
  isLast?: boolean
  isSaving?: boolean
  lastSavedAt?: Date | null
  saveError?: string | null
  topBar?: ReactNode
  footerExtra?: ReactNode
  children: ReactNode
}

export function WizardShell({
  steps,
  currentIndex,
  onJump,
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  nextDisabled,
  isLast,
  isSaving,
  lastSavedAt,
  saveError,
  topBar,
  footerExtra,
  children,
}: Props) {
  const stepRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    stepRef.current?.focus()
  }, [currentIndex])

  return (
    <div className="bg-bg min-h-screen">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto pb-32 space-y-5 lg:space-y-6">
        {topBar}

        <div className="bg-surface border border-line rounded-lg p-4 lg:p-5 shadow-card space-y-3">
          <WizardStepper steps={steps} currentIndex={currentIndex} onJump={onJump} />
          <div className="flex items-center justify-between text-[11px] text-muted" aria-live="polite">
            {saveError ? (
              <span className="text-[var(--error-text)]">{saveError}</span>
            ) : isSaving ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Saving…
              </span>
            ) : lastSavedAt ? (
              <span>Saved as draft · {formatRelative(lastSavedAt)}</span>
            ) : (
              <span className="opacity-0">·</span>
            )}
          </div>
        </div>

        <div
          ref={stepRef}
          tabIndex={-1}
          role="region"
          aria-label={`Wizard step ${currentIndex + 1} of ${steps.length}`}
          className="outline-none"
        >
          {children}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack || currentIndex === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-line text-xs uppercase tracking-widest text-ink-2 hover:border-gold/40 hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} /> {backLabel}
          </button>
          <div className="flex items-center gap-2">
            {footerExtra}
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext || nextDisabled}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isLast ? 'bg-gold text-inverse hover:opacity-95' : 'bg-gold text-inverse hover:opacity-95'
              }`}
            >
              {nextLabel} {!isLast && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRelative(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}
