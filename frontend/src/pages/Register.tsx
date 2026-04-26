import { useState, FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'
import { clearClientSession } from '../utils/clearSession'

export default function Register() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user, tokens } = await authApi.register(email, displayName, password)
      await clearClientSession(queryClient)
      setAuth(user, tokens.access_token, tokens.refresh_token)
      navigate({ to: '/' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('409') ? 'Email already registered.' : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-4 py-3 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:bg-[var(--brass)]/[0.04] transition-colors text-sm tracking-wider'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex items-baseline justify-center">
            <span style={{ fontFamily: 'var(--serif)', fontSize: '4rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink)' }}>SUB</span>
            <span style={{ fontFamily: 'var(--serif)', fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'var(--gold)' }}>12</span>
          </div>
          <p className="mt-4 t-section-title">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs tracking-wide text-muted" htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="Jane Smith"
            />
          </div>

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

          <div className="space-y-1.5">
            <label className="text-xs tracking-wide text-muted" htmlFor="password">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-10`}
                placeholder="Choose a password"
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
            <p className="text-xs text-muted">Must be at least 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase mt-2"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-xs text-muted leading-relaxed pt-1">
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="text-[var(--brass)] hover:opacity-80 transition-opacity">Terms of Use</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-[var(--brass)] hover:opacity-80 transition-opacity">Privacy Policy</Link>.
          </p>
        </form>

        <p className="text-center t-section-title">
          Have an account?{' '}
          <Link to="/login" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
            Sign in
          </Link>
        </p>

        <p className="text-center t-section-title">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  )
}
