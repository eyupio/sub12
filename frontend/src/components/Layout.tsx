import { PropsWithChildren, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Target, Crosshair, Package, Trophy, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { authApi } from '../api/auth'
import { CornerMark } from './CornerMark'
import { ThemeToggle } from './ThemeToggle'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', mobileLabel: 'Home' },
  { to: '/scores', icon: Target, label: 'Scores', mobileLabel: 'Scores' },
  { to: '/pellet-testing', icon: Crosshair, label: 'Testing', mobileLabel: 'Tests' },
  { to: '/leagues', icon: Trophy, label: 'Leagues', mobileLabel: 'League' },
  { to: '/gear', icon: Package, label: 'Gear', mobileLabel: 'Gear' },
  { to: '/profile', icon: User, label: 'Profile', mobileLabel: 'Me' },
] as const

export default function Layout({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const { user, refreshToken, clearAuth } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false)

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

  // Resolve effective theme for logo selection
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  async function handleLogout() {
    if (refreshToken) {
      try { await authApi.logout(refreshToken) } catch { /* best effort */ }
    }
    clearAuth()
    navigate({ to: '/login' })
  }

  const navLinkBase = 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted hover:text-secondary hover:bg-surface-hover transition-colors text-sm tracking-wide'
  const navLinkActive = 'flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] text-sm tracking-wide'

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Corner crosshair decorations */}
      <CornerMark className="top-5 left-5 text-muted" />
      <CornerMark className="top-5 right-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-subtle bg-nav backdrop-blur z-40">
        <div className="px-5 py-4 border-b border-subtle">
          <img
            src={isDark ? '/logo-horizontal-dark.svg' : '/logo-horizontal-light.svg'}
            alt="SUB12"
            className="h-8 w-auto"
          />
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={navLinkBase}
              activeProps={{ className: navLinkActive }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="text-muted hover:text-secondary transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
          {user && (
            <p className="text-xs text-muted tracking-wide truncate">{user.display_name}</p>
          )}
        </div>
      </aside>

      {/* ── Main content column ──────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className={`lg:hidden sticky top-0 z-50 bg-nav backdrop-blur border-b border-subtle px-4 py-2 items-center justify-between ${isMobileKeyboardOpen ? 'hidden' : 'flex'}`}>
          <img
            src={isDark ? '/logo-horizontal-dark.svg' : '/logo-horizontal-light.svg'}
            alt="SUB12"
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted hidden sm:block tracking-wide">{user.display_name}</span>
            )}
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

        {/* Page content */}
        <main className={`flex-1 overflow-auto lg:pb-0 ${isMobileKeyboardOpen ? 'pb-0' : 'pb-[var(--mobile-nav-offset)]'}`}>
          {children ?? <Outlet />}
        </main>

        {/* Mobile bottom nav */}
        <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-nav backdrop-blur border-t border-subtle overflow-x-hidden ${isMobileKeyboardOpen ? 'hidden' : 'block'}`}>
          <div className="grid grid-cols-6 w-full min-h-[var(--mobile-nav-offset)]">
            {navItems.map(({ to, icon: Icon, label, mobileLabel }) => (
              <Link
                key={to}
                to={to}
                className="h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-muted hover:text-[var(--brass)] transition-colors"
                activeProps={{ className: 'h-[var(--mobile-nav-offset)] min-w-0 flex flex-col items-center justify-center gap-1 px-1 text-[var(--brass)]' }}
              >
                <Icon size={22} />
                <span className="max-w-full truncate text-[9px] tracking-[0.12em] uppercase min-[390px]:hidden">{mobileLabel}</span>
                <span className="hidden max-w-full truncate text-[10px] tracking-[0.08em] uppercase min-[390px]:block">{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
