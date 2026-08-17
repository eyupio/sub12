import { useState, FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { clearClientSession } from '../utils/clearSession'
import { Spinner } from '../components/Skeleton'
import { useBranding } from '../store/branding'
import { PoweredBy } from '../components/PoweredBy'

export default function Login() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const branding = useBranding()
  const branded = branding.site_name !== 'SUB12' || Boolean(branding.logo_url)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.login(email, password)
      if (result.kind === 'challenge') {
        // Carry the challenge token via sessionStorage so it never appears in
        // the URL and never persists past the tab. The TwoFactorChallenge
        // page bounces back to /login if it isn't found (e.g. on reload).
        sessionStorage.setItem('sub12-2fa-challenge', result.challengeToken)
        navigate({ to: '/login/2fa' })
        return
      }
      await clearClientSession(queryClient)
      setAuth(result.user, result.tokens.access_token, result.tokens.refresh_token)
      navigate({ to: '/' })
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setError('Invalid email or password.')
      } else {
        setError("Couldn't reach the server. Please check your connection and try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-4 py-3 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:bg-[var(--brass)]/[0.04] focus:shadow-[0_0_0_3px_var(--ring)] transition-all text-sm tracking-wider'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">
        {/* The sign-in screen is the first thing anyone sees, so it is where
            a self-hosted deployment's own identity has to land. An installation
            that has not been branded keeps the SUB12 lockup unchanged. */}
        <div className="text-center">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.site_name} className="mx-auto h-16 max-w-[240px] object-contain" />
          ) : branded ? (
            <h1
              className="text-4xl font-bold leading-tight text-primary"
              style={{ fontFamily: 'var(--serif)' }}
            >
              {branding.site_name}
            </h1>
          ) : (
            <div className="inline-flex items-baseline justify-center">
              <span style={{ fontFamily: 'var(--serif)', fontSize: '4rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink)' }}>SUB</span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'var(--gold)' }}>12</span>
            </div>
          )}
          {branding.tagline && <p className="mt-2 text-sm text-muted">{branding.tagline}</p>}
          <p className="mt-4 t-section-title">{branding.welcome_heading || 'Sign in to your account'}</p>
          {branding.welcome_message && (
            <p className="mt-2 text-sm text-secondary whitespace-pre-line">{branding.welcome_message}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div role="alert" className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide animate-scale-in">
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
            className="w-full u-sheen u-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 shadow-gold hover:shadow-float transition-shadow text-sm tracking-[0.15em] uppercase mt-2"
            style={{ background: 'linear-gradient(135deg, var(--gold-2), var(--gold))' }}
          >
            {loading && <Spinner size={14} className="border-white/40 border-t-white" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center t-section-title">
          <Link to="/forgot-password" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
            Forgot password?
          </Link>
        </p>

        {/* A deployment that creates accounts by hand should not invite people
            to a sign-up form that will refuse them. */}
        {branding.public_registration && (
          <p className="text-center t-section-title">
            No account?{' '}
            <Link to="/register" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
              Register
            </Link>
          </p>
        )}
        {!branding.public_registration && branding.support_email && (
          <p className="text-center t-section-title">
            No account?{' '}
            <a href={`mailto:${branding.support_email}`} className="text-[var(--brass)] hover:opacity-80 transition-opacity">
              Ask an administrator
            </a>
          </p>
        )}

        <p className="text-center t-section-title">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">
            ← Back to Home
          </Link>
        </p>

        <p className="text-center text-xs text-muted space-x-3 pt-2">
          <Link to="/terms" className="hover:text-[var(--brass)] transition-colors">Terms</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-[var(--brass)] transition-colors">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/cookies" className="hover:text-[var(--brass)] transition-colors">Cookies</Link>
        </p>

        <p className="text-center text-[11px] text-muted">
          <PoweredBy />
        </p>
      </div>
    </div>
  )
}
