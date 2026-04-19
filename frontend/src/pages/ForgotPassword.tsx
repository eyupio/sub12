import { useState, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useThemeStore } from '../store/theme'

export default function ForgotPassword() {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const logoSrc = `${import.meta.env.BASE_URL}${isDark ? 'logo-primary-dark.svg' : 'logo-primary-light.svg'}`

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
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
          <p className="mt-4 text-sm tracking-widest uppercase text-muted">Reset your password</p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-secondary">
              If an account with that email exists, we've sent a password reset link. Check your inbox.
            </p>
            <Link
              to="/login"
              className="inline-block text-[var(--brass)] hover:opacity-80 transition-opacity text-[11px] tracking-widest uppercase"
            >
              Back to Sign In
            </Link>
            <p className="text-[11px] tracking-widest uppercase text-muted">
              <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">
                ← Back to Home
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase mt-2"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <p className="text-center text-[11px] tracking-widest uppercase text-muted">
              Remember your password?{' '}
              <Link to="/login" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
                Sign In
              </Link>
            </p>

            <p className="text-center text-[11px] tracking-widest uppercase text-muted">
              <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">
                ← Back to Home
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
