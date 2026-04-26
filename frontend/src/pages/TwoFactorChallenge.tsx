import { useEffect, useState, FormEvent } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { twoFactorApi } from '../api/twoFactor'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { clearClientSession } from '../utils/clearSession'

const CHALLENGE_KEY = 'sub12-2fa-challenge'

export default function TwoFactorChallenge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const logoSrc = `${import.meta.env.BASE_URL}${isDark ? 'logo-primary-dark.svg' : 'logo-primary-light.svg'}`

  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = sessionStorage.getItem(CHALLENGE_KEY)
    if (!t) {
      navigate({ to: '/login' })
      return
    }
    setChallengeToken(t)
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!challengeToken) return
    setLoading(true)
    setError(null)
    try {
      const { user, tokens } = await twoFactorApi.loginVerify2FA(challengeToken, code.trim())
      sessionStorage.removeItem(CHALLENGE_KEY)
      await clearClientSession(queryClient)
      setAuth(user, tokens.access_token, tokens.refresh_token)
      navigate({ to: '/' })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 && /expired|sign in again/i.test(err.message)) {
          sessionStorage.removeItem(CHALLENGE_KEY)
          setError('Your sign-in attempt expired. Please sign in again.')
          setTimeout(() => navigate({ to: '/login' }), 1200)
          return
        }
        if (err.status === 401) {
          setError('Invalid verification code. Try again.')
        } else {
          setError(err.message || 'Verification failed.')
        }
      } else {
        setError("Couldn't reach the server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-subtle rounded px-4 py-3 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:bg-[var(--brass)]/[0.04] transition-colors text-sm tracking-[0.25em] text-center font-mono'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src={logoSrc} alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-muted">Two-factor verification</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded px-4 py-3 text-sm text-[var(--error-text)] tracking-wide">
              {error}
            </div>
          )}

          <p className="text-xs text-muted text-center">
            {useBackup
              ? 'Enter one of your single-use backup codes.'
              : 'Open your authenticator app and enter the 6-digit code.'}
          </p>

          <div className="space-y-1">
            <label className="text-xs tracking-wide text-muted" htmlFor="code">
              {useBackup ? 'Backup code' : 'Verification code'}
            </label>
            <input
              id="code"
              type="text"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={useBackup ? 'text' : 'numeric'}
              maxLength={useBackup ? 16 : 6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
              placeholder={useBackup ? 'XXXXXXXX' : '••••••'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !challengeToken || code.length === 0}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium rounded py-3 transition-opacity text-sm tracking-[0.15em] uppercase"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={() => { setUseBackup((v) => !v); setCode(''); setError(null) }}
            className="block w-full text-[11px] tracking-widest uppercase text-muted hover:text-[var(--brass)] transition-colors"
          >
            {useBackup ? 'Use authenticator code instead' : 'Use a backup code instead'}
          </button>
        </form>

        <p className="text-center text-[11px] tracking-widest uppercase text-muted">
          <Link to="/login" className="text-muted hover:text-[var(--brass)] transition-colors">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
