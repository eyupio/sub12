import { PropsWithChildren, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Target, Crosshair, Package, Trophy, User, LogOut, Mail, Activity, Users, UserCog, WifiOff, MoreHorizontal, X, Globe, Lightbulb, LifeBuoy, Inbox, HelpCircle, BookOpen, Flag, Zap, MapPin, Database, CalendarClock, Tags } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'
import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { CornerMark } from './CornerMark'
import { ThemeToggle } from './ThemeToggle'
import { ToastContainer } from './Toast'
import { NotificationBell } from './NotificationBell'
import { NavTracker } from './NavTracker'
import { Tooltip } from './Tooltip'
import { Sub12BrandLockup } from './Sub12BrandLockup'
import { tips } from './tooltips'
import QuickCaptureFab from './QuickCaptureFab'
import { clearClientSession } from '../utils/clearSession'

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', mobileLabel: 'Home' },
  { to: '/feed', icon: Activity, label: 'Feed', mobileLabel: 'Feed' },
  { to: '/clubs', icon: Users, label: 'Clubs', mobileLabel: 'Clubs' },
  { to: '/leagues', icon: Trophy, label: 'Leagues', mobileLabel: 'League' },
  { to: '/events', icon: CalendarClock, label: 'Events', mobileLabel: 'Events' },
  { to: '/gear', icon: Package, label: 'Gear', mobileLabel: 'Gear' },
  { to: '/locations', icon: MapPin, label: 'Locations', mobileLabel: 'Places' },
  { to: '/scores', icon: Target, label: 'Scores', mobileLabel: 'Scores' },
  { to: '/pellet-testing', icon: Crosshair, label: 'Testing', mobileLabel: 'Tests' },
  { to: '/drafts', icon: Zap, label: 'Drafts', mobileLabel: 'Drafts' },
  { to: '/profile', icon: User, label: 'Profile', mobileLabel: 'Me' },
  { to: '/support', icon: LifeBuoy, label: 'Support', mobileLabel: 'Tickets' },
  { to: '/feature-requests', icon: Lightbulb, label: 'Features', mobileLabel: 'Ideas' },
  { to: '/help', icon: HelpCircle, label: 'Help', mobileLabel: 'Help' },
] as const

const adminNavItems = [
  { to: '/admin/faqs',           icon: BookOpen, label: 'Admin FAQs',    mobileLabel: 'FAQs'   },
  { to: '/admin/email/settings', icon: Mail,    label: 'Email Admin',   mobileLabel: 'Email'  },
  { to: '/admin/users',          icon: UserCog, label: 'Admin Users',   mobileLabel: 'Users'  },
  { to: '/admin/leagues',        icon: Trophy,  label: 'Admin Leagues', mobileLabel: 'Lgues'  },
  { to: '/admin/clubs',          icon: Users,   label: 'Admin Clubs',   mobileLabel: 'Clubs'  },
  { to: '/admin/categories',     icon: Tags,    label: 'Categories',    mobileLabel: 'Cats'   },
  { to: '/admin/sitemap',        icon: Globe,   label: 'Sitemap & SEO', mobileLabel: 'SEO'    },
  { to: '/admin/backup',         icon: Database, label: 'Backups',      mobileLabel: 'Backup' },
  { to: '/admin/reports',        icon: Flag,    label: 'Admin Reports', mobileLabel: 'Reports'},
  { to: '/admin/support',         icon: Inbox,   label: 'Support Inbox', mobileLabel: 'Inbox' },
]

// Mobile bottom nav is 5 items max. Core daily-use actions.
const mobileNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/feed', icon: Activity, label: 'Feed' },
  { to: '/clubs', icon: Users, label: 'Clubs' },
  { to: '/leagues', icon: Trophy, label: 'League' },
] as const

// Everything not in mobileNavItems appears in the "More" overlay.
const moreMenuItems = [
  { to: '/events', icon: CalendarClock, label: 'Events' },
  { to: '/gear', icon: Package, label: 'Gear' },
  { to: '/locations', icon: MapPin, label: 'Places' },
  { to: '/scores', icon: Target, label: 'Scores' },
  { to: '/pellet-testing', icon: Crosshair, label: 'Testing' },
  { to: '/drafts', icon: Zap, label: 'Drafts' },
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/support', icon: LifeBuoy, label: 'Support' },
  { to: '/feature-requests', icon: Lightbulb, label: 'Features' },
  { to: '/help', icon: HelpCircle, label: 'Help' },
]

export default function Layout({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [moreOpen, setMoreOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems

  // Drafts badge: sum of score-card + pellet-test quick-capture drafts.
  // Low-frequency refetch keeps it cheap but accurate after users save new
  // drafts or graduate old ones from elsewhere in the app.
  const { data: scoreDraftCount } = useQuery({
    queryKey: ['score-drafts-count'],
    queryFn: () => scoreCardApi.draftCount(),
    refetchInterval: 60_000,
    enabled: Boolean(user),
  })
  const { data: pelletDraftCount } = useQuery({
    queryKey: ['pellet-drafts-count'],
    queryFn: () => pelletTestApi.draftCount(),
    refetchInterval: 60_000,
    enabled: Boolean(user),
  })
  const draftCount = (scoreDraftCount?.count ?? 0) + (pelletDraftCount?.count ?? 0)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return

    const viewport = window.visualViewport
    const smallScreen = () => window.matchMedia('(max-width: 1023px)').matches

    const updateKeyboardState = () => {
      if (!smallScreen()) {
        setIsMobileKeyboardOpen(false)
        return
      }

      const viewportShrink = window.innerHeight - viewport.height
      const keyboardVisibleThreshold = 120
      setIsMobileKeyboardOpen(viewportShrink > keyboardVisibleThreshold)
    }

    updateKeyboardState()
    viewport.addEventListener('resize', updateKeyboardState)

    return () => viewport.removeEventListener('resize', updateKeyboardState)
  }, [])

  async function handleLogout() {
    try { await authApi.logout() } catch { /* best effort */ }
    clearAuth()
    await clearClientSession(queryClient)
    navigate({ to: '/' })
  }

  const navLinkBase = 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted hover:text-secondary hover:bg-surface-hover transition-colors text-sm tracking-wide'
  const navLinkActive = 'flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] text-sm tracking-wide'

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <NavTracker />
      <ToastContainer />
      {/* Corner crosshair decorations */}
      <CornerMark className="top-5 left-5 text-muted" />
      <CornerMark className="top-5 right-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      {/* \u2500\u2500 Desktop sidebar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-subtle bg-nav backdrop-blur z-40">
        <div className="px-5 py-4 border-b border-subtle">
          <Tooltip content={tips.homeLogo} placement="right">
            <Link to="/" aria-label="Go to dashboard" className="inline-block hover:opacity-80 transition-opacity">
              <Sub12BrandLockup variant="compact" />
            </Link>
          </Tooltip>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1" aria-label="Primary">
          {navItems.map(({ to, icon: Icon, label }) => {
            const showBadge = to === '/drafts' && draftCount > 0
            return (
              <Link
                key={to}
                to={to}
                className={navLinkBase}
                activeProps={{ className: navLinkActive, 'aria-current': 'page' }}
              >
                <Icon size={20} />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    {draftCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between">
            <Tooltip content={tips.themeToggle}><span><ThemeToggle /></span></Tooltip>
            <div className="flex items-center gap-3">
              <Tooltip content={tips.notificationBell}><span><NotificationBell /></span></Tooltip>
              <Tooltip content={tips.logout}>
                <button
                  onClick={handleLogout}
                  className="text-muted hover:text-secondary transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </Tooltip>
            </div>
          </div>
          {user && (
            <p className="text-xs text-muted tracking-wide truncate">{user.display_name}</p>
          )}
        </div>
      </aside>

      {/* \u2500\u2500 Main content column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className={`lg:hidden sticky top-0 z-50 bg-nav backdrop-blur border-b border-subtle px-4 py-2 items-center justify-between ${isMobileKeyboardOpen ? 'hidden' : 'flex'}`}>
          <Link to="/" aria-label="Go to dashboard" className="inline-block hover:opacity-80 transition-opacity">
            <Sub12BrandLockup variant="compact" />
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted hidden sm:block tracking-wide">{user.display_name}</span>
            )}
            <NotificationBell />
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="text-muted hover:text-secondary transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-amber-600/15 border-b border-amber-600/30 px-4 py-2 flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 text-xs tracking-wide" role="status">
            <WifiOff size={14} />
            <span>You're offline \u2014 some features may be limited</span>
          </div>
        )}

        {/* Page content */}
        <main className={`flex-1 flex flex-col overflow-auto lg:pb-0 ${isMobileKeyboardOpen ? 'pb-0' : 'pb-[var(--mobile-nav-offset)]'}`}>
          <div className="flex-1">
            {children ?? <Outlet />}
          </div>
          <footer className="shrink-0 border-t border-subtle mt-10 px-4 py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted tracking-wide">
            <Link to="/privacy" className="hover:text-[var(--brass)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[var(--brass)] transition-colors">Terms</Link>
            <Link to="/cookies" className="hover:text-[var(--brass)] transition-colors">Cookies</Link>
            <span className="opacity-70 inline-flex items-baseline">
              <span>©&nbsp;</span>
              <span className="inline-flex items-baseline" style={{ fontFamily: 'var(--serif)' }}>
                <span className="font-bold">SUB</span>
                <span className="font-bold text-[0.75em]" style={{ color: 'var(--gold)' }}>12</span>
              </span>
            </span>
          </footer>
        </main>

        {/* Quick-capture FAB: hidden on capture/refine pages to avoid
            duplicating their save button. */}
        <QuickCaptureFabWhenAppropriate />

        {/* Mobile bottom nav \u2014 5 items max */}
        <nav aria-label="Primary mobile" className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-nav backdrop-blur border-t border-subtle overflow-x-hidden ${isMobileKeyboardOpen ? 'hidden' : 'block'}`}>
          <div className="grid grid-cols-5 w-full min-h-[var(--mobile-nav-offset)]">
            {mobileNavItems.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-muted hover:text-[var(--brass)] transition-colors"
                activeProps={{ className: 'h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-[var(--brass)]', 'aria-current': 'page' }}
              >
                <Icon size={22} />
                <span className="max-w-full truncate text-[11px] tracking-wide">{label}</span>
              </Link>
            ))}
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              className={`h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 transition-colors ${moreOpen ? 'text-[var(--brass)]' : 'text-muted hover:text-[var(--brass)]'}`}
            >
              <MoreHorizontal size={22} />
              <span className="max-w-full truncate text-[11px] tracking-wide">More</span>
            </button>
          </div>
        </nav>

        {/* More menu overlay */}
        {moreOpen && (
          <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="absolute bottom-[var(--mobile-nav-offset)] left-0 right-0 bg-surface border-t border-subtle rounded-t-xl flex flex-col max-h-[calc(100dvh-var(--mobile-nav-offset)-1rem)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <span className="text-xs tracking-widest uppercase text-muted">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-muted hover:text-secondary transition-colors" aria-label="Close menu">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto px-4 pb-4 space-y-1">
                {moreMenuItems.map(({ to, icon: Icon, label }) => {
                  const showBadge = to === '/drafts' && draftCount > 0
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-secondary hover:bg-surface-hover transition-colors text-sm"
                    >
                      <Icon size={18} className="text-muted" />
                      <span className="flex-1">{label}</span>
                      {showBadge && (
                        <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          {draftCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
                {isAdmin && (
                  <>
                    <div className="border-t border-subtle my-2" />
                    <span className="block text-[10px] tracking-widest uppercase text-muted px-3 py-1">Admin</span>
                    {adminNavItems.map(({ to, icon: Icon, label }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-secondary hover:bg-surface-hover transition-colors text-sm"
                      >
                        <Icon size={18} className="text-muted" />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Hidden on capture/refine screens so the FAB doesn't float over their
// own save button. window.location is fine here because we just want the
// current path — no reactive state needed; the FAB re-renders on every
// navigation via Layout's re-mount.
function QuickCaptureFabWhenAppropriate() {
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const hide =
    path.startsWith('/quick-capture') ||
    path === '/scores/new' ||
    path === '/pellet-testing/new' ||
    path === '/login' ||
    path === '/register'
  if (hide) return null
  return <QuickCaptureFab />
}
