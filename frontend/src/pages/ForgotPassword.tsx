import { useState, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'

export default function ForgotPassword() {
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex items-baseline justify-center">
            <span style={{ fontFamily: 'var(--serif)', fontSize: '4rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink)' }}>SUB</span>
            <span style={{ fontFamily: 'var(--serif)', fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'var(--gold)' }}>12</span>
          </div>
          <p className="mt-4 t-section-title">Reset your password</p>
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
              Back to sign in
            </Link>
            <p className="t-section-title">
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
                className="w-full u-sheen u-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 shadow-gold hover:shadow-float transition-shadow text-sm tracking-[0.15em] uppercase mt-2"
                style={{ background: 'linear-gradient(135deg, var(--gold-2), var(--gold))' }}
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <p className="text-center t-section-title">
              Remember your password?{' '}
              <Link to="/login" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
                Sign in
              </Link>
            </p>

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
          </>
        )}
      </div>
    </div>
  )
}
