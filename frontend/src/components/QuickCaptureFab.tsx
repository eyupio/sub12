import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'
import { haptics } from '../utils/haptics'

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
      onClick={() => haptics.tapMedium()}
      className="group fixed z-30 bottom-[calc(var(--mobile-nav-offset)+1rem)] right-4 lg:bottom-6 lg:right-6 flex items-center gap-2 px-4 py-3 rounded-full text-black shadow-gold hover:shadow-float u-press u-sheen font-medium tracking-wide transition-shadow"
      style={{ background: 'linear-gradient(135deg, var(--gold-2), var(--gold))' }}
    >
      {/* Soft halo that expands on hover — marks the FAB as the app's one
          always-available primary action without adding chrome. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ boxShadow: '0 0 0 6px var(--ring)' }}
      />
      <Zap size={18} className="relative transition-transform duration-300 group-hover:rotate-12" />
      <span className="relative text-sm">Quick capture</span>
    </Link>
  )
}
