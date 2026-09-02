import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Target, Crosshair, Package, Trophy, User, LogOut, Mail, Activity, Users, UserCog, WifiOff, MoreHorizontal, X, Globe, Lightbulb, LifeBuoy, Inbox, HelpCircle, BookOpen, Flag, Zap, MapPin, Database, CalendarClock, Bot, BarChart3, RefreshCw, Megaphone, Images, Palette } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { authApi } from '../api/auth'
import { scoreCardApi } from '../api/scoreCards'
import { pelletTestApi } from '../api/pelletTesting'
import { CornerMark } from './CornerMark'
import { ThemeToggle } from './ThemeToggle'
import { ToastContainer } from './Toast'
import { NotificationBell } from './NotificationBell'
import { NavTracker } from './NavTracker'
import { Tooltip } from './Tooltip'
import { SiteMark } from './SiteMark'
import { PoweredBy } from './PoweredBy'
import { useBranding } from '../store/branding'
import { tips } from './tooltips'
import QuickCaptureFab from './QuickCaptureFab'
import { usePullToRefresh, pageScrollTop } from '../hooks/usePullToRefresh'
import { clearClientSession } from '../utils/clearSession'
import { haptics } from '../utils/haptics'

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', mobileLabel: 'Home' },
  { to: '/feed', icon: Activity, label: 'Feed', mobileLabel: 'Feed' },
  { to: '/clubs', icon: Users, label: 'Clubs', mobileLabel: 'Clubs' },
  { to: '/leagues', icon: Trophy, label: 'Leagues', mobileLabel: 'League' },
  { to: '/events', icon: CalendarClock, label: 'Events', mobileLabel: 'Events' },
  { to: '/gear', icon: Package, label: 'Gear', mobileLabel: 'Gear' },
  { to: '/locations', icon: MapPin, label: 'Locations', mobileLabel: 'Places' },
  { to: '/scores', icon: Target, label: 'Scores', mobileLabel: 'Scores' },
  { to: '/gallery', icon: Images, label: 'Gallery', mobileLabel: 'Gallery' },
  { to: '/pellet-testing', icon: Crosshair, label: 'Testing', mobileLabel: 'Tests' },
  { to: '/drafts', icon: Zap, label: 'Drafts', mobileLabel: 'Drafts' },
  { to: '/profile', icon: User, label: 'Profile', mobileLabel: 'Me' },
  { to: '/support', icon: LifeBuoy, label: 'Support', mobileLabel: 'Tickets' },
  { to: '/feature-requests', icon: Lightbulb, label: 'Features', mobileLabel: 'Ideas' },
  { to: '/help', icon: HelpCircle, label: 'Help', mobileLabel: 'Help' },
] as const

const adminNavItems = [
  { to: '/admin/branding',       icon: Palette, label: 'Branding',      mobileLabel: 'Brand'  },
  { to: '/admin/faqs',           icon: BookOpen, label: 'Admin FAQs',    mobileLabel: 'FAQs'   },
  { to: '/admin/email/settings', icon: Mail,    label: 'Email Admin',   mobileLabel: 'Email'  },
  { to: '/admin/users',          icon: UserCog, label: 'Admin Users',   mobileLabel: 'Users'  },
  { to: '/admin/leagues',        icon: Trophy,  label: 'Admin Leagues', mobileLabel: 'Lgues'  },
  { to: '/admin/clubs',          icon: Users,   label: 'Admin Clubs',   mobileLabel: 'Clubs'  },
  { to: '/admin/events',         icon: CalendarClock, label: 'Admin Events',  mobileLabel: 'Events' },
  { to: '/admin/sitemap',        icon: Globe,   label: 'Sitemap & SEO', mobileLabel: 'SEO'    },
  { to: '/admin/backup',         icon: Database, label: 'Backups',      mobileLabel: 'Backup' },
  { to: '/admin/simulation',     icon: Bot,     label: 'Activity Sim',  mobileLabel: 'Sim'    },
  { to: '/admin/gear',           icon: BarChart3, label: 'Gear Analytics', mobileLabel: 'Gear' },
  { to: '/admin/reports',        icon: Flag,    label: 'Admin Reports', mobileLabel: 'Reports'},
  { to: '/admin/support',         icon: Inbox,   label: 'Support Inbox', mobileLabel: 'Inbox' },
  { to: '/admin/announcements',  icon: Megaphone, label: 'Announcements', mobileLabel: 'Notice' },
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
  { to: '/gallery', icon: Images, label: 'Gallery' },
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
  const moreSheetRef = useRef<HTMLDivElement>(null)
  // Drives the sticky mobile header's elevation: flat at the top of the page,
  // shadowed once content has scrolled underneath it.
  const [scrolled, setScrolled] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const isAdmin = user?.role === 'admin'
  const branding = useBranding()
  // A single-club deployment is that club's own site, so the club nav entry
  // carries its name rather than the directory's. The destination stays
  // /clubs — the directory redirects straight through to the club, which is
  // also what happens to anyone who arrives on it from a bookmark.
  const clubNavLabel =
    branding.deployment_mode === 'single_club' && branding.primary_club
      ? branding.primary_club.name
      : null
  // ⚡ Bolt: memoize navItems — the array spread allocates a new 24-item array on
  // every render. Layout re-renders on every draft-count poll (60 s), route
  // change, and online/offline toggle. isAdmin is stable for the entire session
  // (changes at most once), so the spread cost is nearly always wasted work.
  const navItems = useMemo(
    () => {
      const items = isAdmin ? [...baseNavItems, ...adminNavItems] : [...baseNavItems]
      if (!clubNavLabel) return items
      return items.map((item) =>
        item.to === '/clubs' ? { ...item, label: clubNavLabel, mobileLabel: 'Club' } : item
      )
    },
    [isAdmin, clubNavLabel]
  )

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

  // The one "reload" affordance the app has: the native shell has no browser
  // chrome, and a WebView reload would drop the router back to the start. Every
  // query the current screen is actually using is refetched instead.
  const refreshData = useCallback(() => queryClient.refetchQueries({ type: 'active' }), [queryClient])

  // Pull-to-refresh on the page scroller. Suppressed while the More sheet or the
  // keyboard is up, when a downward drag belongs to that surface instead.
  const { indicatorRef, refreshing } = usePullToRefresh(
    mainRef,
    refreshData,
    !moreOpen && !isMobileKeyboardOpen,
  )

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

  // <main> only scrolls itself when its content overflows it; the shell is
  // document-height, so usually the document scrolls and <main> never emits a
  // scroll event. Listen on both and read whichever is actually offset.
  useEffect(() => {
    const el = mainRef.current
    const onScroll = () => setScrolled(pageScrollTop(el) > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      el?.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Close the More sheet when the viewport grows past the mobile breakpoint —
  // otherwise it stays mounted invisibly and traps the next Escape press.
  const closeMore = useCallback(() => setMoreOpen(false), [])
  useDialogFocus({ dialogRef: moreSheetRef, onClose: closeMore, open: moreOpen })

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

  // Sidebar links carry a brass rail on the left edge. It's scaled to 0 by
  // default and to full height when active, so switching routes animates the
  // marker rather than repainting it.
  const navLinkBase = 'group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted hover:text-secondary hover:bg-surface-hover u-nudge text-sm tracking-wide before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-[var(--brass)] before:scale-y-0 before:origin-center before:transition-transform before:duration-200'
  const navLinkActive = 'group relative flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] text-sm tracking-wide before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-[var(--brass)] before:scale-y-100 before:origin-center before:transition-transform before:duration-200'

  // `app-tab` carries the dot/pill treatment (see index.css); `is-active`
  // switches it on. TanStack's activeProps replaces className wholesale, so the
  // active variant has to repeat the base classes.
  const mobileNavBase = 'app-tab relative h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-muted hover:text-[var(--brass)] u-press transition-colors no-min-target'
  const mobileNavActive = `${mobileNavBase} is-active text-[var(--brass)]`

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <NavTracker />
      <ToastContainer />
      {/* Keyboard users can jump straight past the 24-item sidebar. */}
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* Corner crosshair decorations */}
      <CornerMark className="top-5 left-5 text-muted" />
      <CornerMark className="top-5 right-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-subtle bg-nav backdrop-blur z-40">
        <div className="px-5 py-4 border-b border-subtle">
          <Tooltip content={tips.homeLogo} placement="right">
            <Link
              to="/"
              aria-label="Go to dashboard and refresh"
              onClick={() => { void refreshData() }}
              className="inline-block hover:opacity-80 transition-opacity"
            >
              <SiteMark />
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
                <Icon size={20} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 u-tnum">
                    {draftCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between">
            {/* A deployment that has fixed its look withholds the toggle. The
                empty span keeps the row's justify-between spacing, or the
                notification and logout controls slide to the left edge. */}
            {branding.allow_theme_toggle ? (
              <Tooltip content={tips.themeToggle}><span><ThemeToggle /></span></Tooltip>
            ) : (
              <span />
            )}
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

      {/* ── Main content column ────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header
          data-scrolled={scrolled}
          className={`app-mobile-header lg:hidden sticky top-0 z-50 bg-nav backdrop-blur-xl border-b border-subtle px-4 py-2 items-center justify-between ${isMobileKeyboardOpen ? 'hidden' : 'flex'}`}
        >
          <Link
            to="/"
            aria-label="Go to dashboard and refresh"
            onClick={() => { haptics.tapLight(); void refreshData() }}
            className="inline-block hover:opacity-80 transition-opacity"
          >
            <SiteMark />
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted hidden sm:block tracking-wide">{user.display_name}</span>
            )}
            <NotificationBell />
            {branding.allow_theme_toggle && <ThemeToggle />}
            <button
              onClick={handleLogout}
              className="text-muted hover:text-secondary transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Pull-to-refresh indicator. usePullToRefresh writes its transform and
            opacity directly, so it deliberately carries no inline style here. */}
        <div
          ref={indicatorRef}
          role="status"
          aria-live="polite"
          className="lg:hidden pointer-events-none fixed left-1/2 top-0 z-[60] h-10 w-10 flex items-center justify-center rounded-full bg-surface border border-subtle shadow-float text-[var(--brass)] opacity-0"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="sr-only">{refreshing ? 'Refreshing' : ''}</span>
        </div>

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-amber-600/15 border-b border-amber-600/30 px-4 py-2 flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 text-xs tracking-wide animate-slide-in" role="status">
            <WifiOff size={14} className="animate-pulse" />
            <span>You're offline — some features may be limited</span>
          </div>
        )}

        {/* Page content. Deliberately not a scroll container: the shell is
            `min-h-screen` — a floor, not a height — so <main> always grows to
            its content and the document is the real scroller. Giving it
            `overflow-auto` made it a scroll container that can never scroll,
            and the `overscroll-y-contain` on top stopped a touch gesture
            landing inside it from chaining out to the document, so swipes were
            swallowed and the page would not move at all. Native overscroll is
            suppressed on the viewport instead (see `body` in index.css). */}
        <main
          id="main-content"
          ref={mainRef}
          className={`flex-1 flex flex-col lg:pb-0 ${isMobileKeyboardOpen ? 'pb-0' : 'pb-[var(--mobile-nav-offset)]'}`}
        >
          <div className="flex-1">
            {children ?? <Outlet />}
          </div>
          {/* The quick-capture FAB is fixed above the mobile nav, so the last
              strip of the page sits underneath it. The extra bottom padding
              lifts these links clear of it. */}
          <footer className="shrink-0 mt-10 px-4 pt-4 pb-20 lg:pb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted tracking-wide relative before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-[linear-gradient(90deg,transparent,var(--line-2),transparent)]">
            <Link to="/privacy" className="hover:text-[var(--brass)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[var(--brass)] transition-colors">Terms</Link>
            <Link to="/cookies" className="hover:text-[var(--brass)] transition-colors">Cookies</Link>
            {/* A rebranded deployment puts its own name here; sub12.io still
                gets the unbranded lockup it always had. */}
            {branding.site_name && branding.site_name !== 'SUB12' ? (
              <span className="opacity-70">© {branding.site_name}</span>
            ) : (
              <span className="opacity-70 inline-flex items-baseline">
                <span>©&nbsp;</span>
                <span className="inline-flex items-baseline" style={{ fontFamily: 'var(--serif)' }}>
                  <span className="font-bold">SUB</span>
                  <span className="font-bold text-[0.75em]" style={{ color: 'var(--gold)' }}>12</span>
                </span>
              </span>
            )}
            {/* Project attribution and the AGPL-3.0 section 13 source link.
                Both are licence-and-provenance obligations rather than
                decoration — see PoweredBy, which is deliberately the only
                place they are written. */}
            <PoweredBy />
          </footer>
        </main>

        {/* Quick-capture FAB: hidden on capture/refine pages to avoid
            duplicating their save button. */}
        <QuickCaptureFabWhenAppropriate />

        {/* Mobile bottom nav — 5 items max */}
        <nav aria-label="Primary mobile" className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-nav backdrop-blur-xl border-t border-subtle overflow-x-hidden ${isMobileKeyboardOpen ? 'hidden' : 'block'}`}>
          <div className="grid grid-cols-5 w-full min-h-[var(--mobile-nav-offset)]">
            {mobileNavItems.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => haptics.tapLight()}
                className={mobileNavBase}
                activeProps={{ className: mobileNavActive, 'aria-current': 'page' }}
              >
                {/* Active tab gets a brass dot above the glyph and a tinted
                    pill behind it — legible at a glance on a small screen. */}
                <span className="nav-dot" aria-hidden="true" />
                <span className="nav-pill" aria-hidden="true" />
                <Icon size={22} className="relative transition-transform duration-200" />
                <span className="relative max-w-full truncate text-[11px] tracking-wide">{label}</span>
              </Link>
            ))}
            <button
              onClick={() => { haptics.tapLight(); setMoreOpen(prev => !prev) }}
              aria-label="More navigation options"
              aria-expanded={moreOpen}
              className={`${mobileNavBase} ${moreOpen ? 'text-[var(--brass)]' : ''}`}
            >
              <span className="nav-pill" aria-hidden="true" />
              <MoreHorizontal
                size={22}
                className={`relative transition-transform duration-300 ${moreOpen ? 'rotate-90' : ''}`}
              />
              <span className="relative max-w-full truncate text-[11px] tracking-wide">More</span>
            </button>
          </div>
        </nav>

        {/* More menu overlay */}
        {moreOpen && (
          <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
            <div
              ref={moreSheetRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="More navigation options"
              className="absolute bottom-[var(--mobile-nav-offset)] left-0 right-0 bg-surface border-t border-subtle rounded-t-[var(--radius-xl)] shadow-overlay flex flex-col max-h-[calc(100dvh-var(--mobile-nav-offset)-1rem)] animate-sheet-up"
              onClick={e => e.stopPropagation()}
            >
              {/* Grab handle — the standard affordance for a dismissible sheet. */}
              <div className="pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
                <span className="h-1 w-9 rounded-full bg-[var(--line-2)]" />
              </div>
              <div className="flex items-center justify-between px-4 pt-2 pb-2 shrink-0">
                <span className="t-label-caps">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-muted hover:text-secondary u-press transition-colors no-min-target" aria-label="Close menu">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto px-4 pb-4 space-y-1 u-stagger">
                {moreMenuItems.map(({ to, icon: Icon, label }) => {
                  const showBadge = to === '/drafts' && draftCount > 0
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => { haptics.tapLight(); setMoreOpen(false) }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-secondary hover:bg-surface-hover hover:text-[var(--brass)] u-nudge text-sm"
                      activeProps={{ className: 'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] text-sm', 'aria-current': 'page' }}
                    >
                      <Icon size={18} className="text-muted shrink-0" />
                      <span className="flex-1">{label}</span>
                      {showBadge && (
                        <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 u-tnum">
                          {draftCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
                {isAdmin && (
                  <>
                    <hr className="u-hairline my-2" />
                    <span className="block t-label-caps px-3 py-1">Admin</span>
                    {adminNavItems.map(({ to, icon: Icon, label }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => { haptics.tapLight(); setMoreOpen(false) }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-secondary hover:bg-surface-hover hover:text-[var(--brass)] u-nudge text-sm"
                      >
                        <Icon size={18} className="text-muted shrink-0" />
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
