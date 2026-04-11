import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, Target, Trophy, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scores/new', icon: Target, label: 'New Score' },
  { to: '/leagues', icon: Trophy, label: 'Leagues' },
  { to: '/profile', icon: User, label: 'Profile' },
] as const

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
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-mono font-bold tracking-tight text-brand-400">
          sub-12
        </span>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-slate-400 hidden sm:block">{user.display_name}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom nav — mobile first */}
      <nav className="sticky bottom-0 z-50 bg-slate-900 border-t border-slate-800">
        <div className="flex justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 px-4 py-3 text-slate-400 hover:text-brand-400 transition-colors"
              activeProps={{ className: 'flex flex-col items-center gap-1 px-4 py-3 text-brand-400' }}
            >
              <Icon size={22} />
              <span className="text-xs">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
