type Sub12BrandLockupProps = {
  variant?: 'full' | 'compact'
  className?: string
}

const highlightedTargets = new Set([3, 11, 18])

function TargetGrid() {
  return (
    <svg
      className="h-32 w-32 shrink-0 sm:h-36 sm:w-36"
      viewBox="0 0 156 156"
      fill="none"
      aria-hidden="true"
    >
      {Array.from({ length: 25 }, (_, index) => {
        const col = index % 5
        const row = Math.floor(index / 5)
        const cx = 8 + col * 35
        const cy = 8 + row * 35
        const highlighted = highlightedTargets.has(index)
        return (
          <g key={index}>
            <circle
              cx={cx}
              cy={cy}
              r="11"
              style={{
                stroke: highlighted ? 'var(--gold)' : 'var(--line-2)',
                strokeWidth: highlighted ? 1.3 : 0.6,
                opacity: highlighted ? 1 : 0.5,
              }}
            />
            <circle
              cx={cx}
              cy={cy}
              r={highlighted ? '3.2' : '2'}
              style={{
                fill: highlighted ? 'var(--gold)' : 'var(--muted)',
                opacity: highlighted ? 1 : 0.4,
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function Sub12BrandLockup({ variant = 'full', className = '' }: Sub12BrandLockupProps) {
  if (variant === 'compact') {
    return (
      <span
        className={`inline-block text-3xl font-bold leading-none tracking-normal text-primary ${className}`}
        style={{ fontFamily: 'var(--serif)' }}
      >
        SUB12
      </span>
    )
  }

  return (
    <div
      className={`inline-flex max-w-full items-center gap-6 overflow-hidden rounded-lg border border-[#D9C9AA] bg-[#EFE6D2] px-5 py-4 text-left shadow-[0_18px_60px_rgba(42,31,18,0.14)] dark:border-[rgba(212,164,74,0.22)] dark:bg-surface dark:shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="min-w-0 shrink-0">
        <p
          className="text-[52px] font-bold leading-none tracking-normal text-[#2A1F12] dark:text-[#ece6d4] sm:text-[64px]"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          SUB12
        </p>
        <p className="mt-3 text-sm leading-none text-[#5A4632] dark:text-[rgba(236,230,212,0.65)] sm:text-base">
          Precision shooting, properly tracked.
        </p>
        <div className="mt-5 h-0.5 w-14 bg-[#B8741F] dark:bg-[#D4A44A]" />
        <p className="mt-4 font-mono text-xs font-medium leading-none text-[#B8741F] dark:text-[#D4A44A] sm:text-sm">
          sub12.io
        </p>
      </div>
      <div className="hidden sm:block">
        <TargetGrid />
      </div>
    </div>
  )
}
