export function CornerMark({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      className={`fixed w-[30px] h-[30px] opacity-[0.08] pointer-events-none z-0 ${className}`}
    >
      <line x1="15" y1="0" x2="15" y2="30" stroke="currentColor" strokeWidth="0.5"/>
      <line x1="0"  y1="15" x2="30" y2="15" stroke="currentColor" strokeWidth="0.5"/>
    </svg>
  )
}
