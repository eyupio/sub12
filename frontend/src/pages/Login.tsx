import { useState, FormEvent } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/logo-primary-dark.svg" alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-white/40">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded px-4 py-3 text-sm text-red-300 tracking-wide">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] tracking-widest uppercase text-white/40" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A] focus:bg-[rgba(212,164,74,0.04)] transition-colors text-sm tracking-wider"
              placeholder="YOUR EMAIL"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] tracking-widest uppercase text-white/40" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A] focus:bg-[rgba(212,164,74,0.04)] transition-colors text-sm tracking-wider"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#D4A44A] hover:bg-[#E0B35A] disabled:opacity-50 text-[#0C0C0C] font-medium rounded py-3 transition-colors text-sm tracking-[0.15em] uppercase mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11px] tracking-widest uppercase text-white/25">
          No account?{' '}
          <Link to="/register" className="text-[#D4A44A] hover:text-[#E0B35A] transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
