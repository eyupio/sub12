import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'

interface QuickCaptureFabProps {
  /** Overrides the default Quick Capture destination. Use to pre-select
   *  a type/league/club via query params from the invoking page. */
  to?: string
  label?: string
}

// Persistent bottom-right FAB surfacing Quick Capture on every page that
// makes sense (Home, score history, pellet tests, league detail, club
// detail). Kept off the Layout root so pages can opt in via search/route
// context — sometimes we want different pre-filled context per page.
export default function QuickCaptureFab({ to = '/quick-capture', label = 'Quick capture' }: QuickCaptureFabProps) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="fixed z-30 bottom-[calc(var(--mobile-nav-offset)+1rem)] right-4 lg:bottom-6 lg:right-6 flex items-center gap-2 px-4 py-3 rounded-full bg-[var(--brass)] text-black shadow-lg hover:scale-105 active:scale-95 transition-transform font-medium tracking-wide"
    >
      <Zap size={18} />
      <span className="text-sm">Quick capture</span>
    </Link>
  )
}
