import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Target, Package, Trophy, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scores', icon: Target, label: 'Scores' },
  { to: '/leagues', icon: Trophy, label: 'Leagues' },
  { to: '/gear', icon: Package, label: 'Gear' },
  { to: '/profile', icon: User, label: 'Profile' },
] as const

// Minimal crosshair corner mark
function CornerMark({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      className={`fixed w-[30px] h-[30px] opacity-[0.08] pointer-events-none z-0 ${className}`}
    >
      <line x1="15" y1="0" x2="15" y2="30" stroke="white" strokeWidth="0.5"/>
      <line x1="0"  y1="15" x2="30" y2="15" stroke="white" strokeWidth="0.5"/>
    </svg>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const { user, refreshToken, clearAuth } = useAuthStore()

  async function handleLogout() {
    if (refreshToken) {
      try { await authApi.logout(refreshToken) } catch { /* best effort */ }
    }
    clearAuth()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Corner crosshair decorations */}
      <CornerMark className="top-5 left-5" />
      <CornerMark className="top-5 right-5" />
      <CornerMark className="bottom-5 left-5" />
      <CornerMark className="bottom-5 right-5" />

      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-[#111111]/90 backdrop-blur border-b border-white/[0.06] px-4 py-2 flex items-center justify-between">
        <img
          src="/logo-horizontal-dark.svg"
          alt="SUB12"
          className="h-8 w-auto"
        />
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-steel hidden sm:block tracking-wide">{user.display_name}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-50 bg-[#111111]/90 backdrop-blur border-t border-white/[0.06]">
        <div className="flex justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 px-4 py-3 text-white/30 hover:text-[#D4A44A] transition-colors"
              activeProps={{ className: 'flex flex-col items-center gap-1 px-4 py-3 text-[#D4A44A]' }}
            >
              <Icon size={22} />
              <span className="text-[10px] tracking-widest uppercase">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
