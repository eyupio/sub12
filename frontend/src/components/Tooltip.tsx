import { ReactNode } from 'react'
import Tippy from '@tippyjs/react'
import { HelpCircle } from 'lucide-react'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: ReactNode
  placement?: Placement
  children: React.ReactElement
  disabled?: boolean
  delay?: number | [number, number]
}

export function Tooltip({ content, placement = 'top', children, disabled, delay = [250, 0] }: TooltipProps) {
  if (!content || disabled) return children
  return (
    <Tippy
      content={content}
      placement={placement}
      delay={delay}
      arrow
      maxWidth={320}
    >
      {children}
    </Tippy>
  )
}

interface HelpIconProps {
  content: ReactNode
  size?: number
  className?: string
  label?: string
}

export function HelpIcon({ content, size = 16, className = '', label = 'Help' }: HelpIconProps) {
  return (
    <Tooltip content={content} placement="bottom">
      <button
        type="button"
        aria-label={label}
        className={`inline-flex items-center justify-center text-muted hover:text-[var(--brass)] transition-colors ${className}`}
      >
        <HelpCircle size={size} />
      </button>
    </Tooltip>
  )
}

export default Tooltip
