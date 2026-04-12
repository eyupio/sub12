import { useState, FormEvent } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user, tokens } = await authApi.login(email, password)
      setAuth(user, tokens.access_token, tokens.refresh_token)
      navigate({ to: '/' })
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-4 py-3 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:bg-[var(--brass)]/[0.04] transition-colors text-sm tracking-wider'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src={isDark ? '/logo-primary-dark.svg' : '/logo-primary-light.svg'} alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] tracking-widest uppercase text-muted" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="YOUR EMAIL"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] tracking-widest uppercase text-muted" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11px] tracking-widest uppercase text-muted">
          <Link to="/forgot-password" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
            Forgot password?
          </Link>
        </p>

        <p className="text-center text-[11px] tracking-widest uppercase text-muted">
          No account?{' '}
          <Link to="/register" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
            Register
          </Link>
        </p>

        <p className="text-center text-[11px] tracking-widest uppercase text-muted">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  )
}
