import { Check } from 'lucide-react'
import { haptics } from '../../utils/haptics'

export type WizardStepStatus = 'pending' | 'current' | 'complete'

export interface WizardStepDescriptor {
  key: string
  label: string
  status: WizardStepStatus
  reachable: boolean
}

interface Props {
  steps: WizardStepDescriptor[]
  currentIndex: number
  onJump: (index: number) => void
}

export function WizardStepper({ steps, currentIndex, onJump }: Props) {
  const total = steps.length
  const current = steps[currentIndex]

  return (
    <nav aria-label="Wizard steps">
      {/* Mobile compact: chevron + "Step n of m · label" */}
      <div className="lg:hidden flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">
          Step {currentIndex + 1} of {total}
        </div>
        <div className="text-sm text-ink truncate">{current?.label}</div>
      </div>

      {/* Desktop: full stepper */}
      <ol className="hidden lg:flex items-center gap-2">
        {steps.map((s, i) => {
          const isCurrent = i === currentIndex
          const isComplete = s.status === 'complete'
          const cls = isCurrent
            ? 'border-gold text-gold bg-gold-tint/40'
            : isComplete
              ? 'border-line text-ink-2 hover:border-gold/40'
              : 'border-line text-muted hover:border-gold/40'
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { if (s.reachable) { haptics.selectionChanged(); onJump(i) } }}
                disabled={!s.reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                    isComplete
                      ? 'bg-gold text-inverse border-gold'
                      : isCurrent
                        ? 'border-gold text-gold'
                        : 'border-line text-muted'
                  }`}
                >
                  {isComplete ? <Check size={10} /> : <span className="text-[10px]">{i + 1}</span>}
                </span>
                <span>{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <span className="text-line" aria-hidden>
                  ›
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
