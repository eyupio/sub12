import { ReactNode } from 'react'

export interface Chip<T> {
  value: T
  label: string
  hint?: string
  icon?: ReactNode
}

interface ChipSelectorProps<T> {
  options: Chip<T>[]
  value: T | null
  onChange: (value: T | null) => void
  allowClear?: boolean
  ariaLabel?: string
}

// Quick-capture UI primitive: a horizontal scroll row of tappable chips.
// Single-select; tapping the active chip clears the selection when
// allowClear is true. Designed for one-tap data entry on mobile — no
// keyboard, no dropdown, large hit target.
export function ChipSelector<T extends string | number>({
  options,
  value,
  onChange,
  allowClear = true,
  ariaLabel,
}: ChipSelectorProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2"
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected && allowClear ? null : opt.value)}
            className={
              selected
                ? 'px-4 py-2 rounded-full border text-sm tracking-wide bg-[var(--brass)]/15 border-[var(--brass)] text-[var(--brass)] font-medium'
                : 'px-4 py-2 rounded-full border text-sm tracking-wide border-subtle text-secondary bg-surface hover:bg-surface-hover transition-colors'
            }
          >
            {opt.icon && <span className="mr-1.5 align-middle">{opt.icon}</span>}
            {opt.label}
            {opt.hint && <span className="ml-1.5 text-xs text-muted">{opt.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
