import { useState, FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate, Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const logoSrc = `${import.meta.env.BASE_URL}${isDark ? 'logo-primary-dark.svg' : 'logo-primary-light.svg'}`

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
          <img src={logoSrc} alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div role="alert" className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs tracking-wide text-muted" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs tracking-wide text-muted" htmlFor="password">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-10`}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase mt-2"
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
