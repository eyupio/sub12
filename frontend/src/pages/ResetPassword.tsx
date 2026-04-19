import { useState, FormEvent } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useThemeStore } from '../store/theme'
import { CheckCircle, XCircle } from 'lucide-react'

export default function ResetPassword() {
  const search = useSearch({ strict: false }) as { token?: string }
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const logoSrc = `${import.meta.env.BASE_URL}${isDark ? 'logo-primary-dark.svg' : 'logo-primary-light.svg'}`

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!search.token) {
      setError('Missing reset token.')
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword(search.token, password)
      setSuccess(true)
    } catch {
      setError('Invalid or expired reset link. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-4 py-3 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:bg-[var(--brass)]/[0.04] transition-colors text-sm tracking-wider'

  if (!search.token && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <XCircle size={32} className="mx-auto text-[var(--error-text)]" />
          <p className="text-sm text-[var(--error-text)]">No reset token provided.</p>
          <Link
            to="/forgot-password"
            className="inline-block text-[var(--brass)] hover:opacity-80 transition-opacity text-[11px] tracking-widest uppercase"
          >
            Request a New Link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src={logoSrc} alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-muted">Set a new password</p>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <CheckCircle size={32} className="mx-auto text-[var(--brass)]" />
            <p className="text-sm text-secondary">Your password has been reset successfully.</p>
            <Link
              to="/login"
              className="inline-block mt-2 px-4 py-2 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors"
            >
              Sign In
            </Link>
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
                <label className="text-[11px] tracking-widest uppercase text-muted" htmlFor="password">New Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] tracking-widest uppercase text-muted" htmlFor="confirm">Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase mt-2"
              >
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>

            <p className="text-center text-[11px] tracking-widest uppercase text-muted">
              <Link to="/login" className="text-[var(--brass)] hover:opacity-80 transition-opacity">
                Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
