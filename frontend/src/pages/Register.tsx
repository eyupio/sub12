import { useState, FormEvent } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Register() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user, tokens } = await authApi.register(email, displayName, password)
      setAuth(user, tokens.access_token, tokens.refresh_token)
      navigate({ to: '/' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('409') ? 'Email already registered.' : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/logo-primary-dark.svg" alt="SUB12" className="h-40 w-auto mx-auto" />
          <p className="mt-4 text-sm tracking-widest uppercase text-white/40">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded px-4 py-3 text-sm text-red-300 tracking-wide">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] tracking-widest uppercase text-white/40" htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A] focus:bg-[rgba(212,164,74,0.04)] transition-colors text-sm tracking-wider"
              placeholder="JOHN SMITH"
            />
          </div>

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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A] focus:bg-[rgba(212,164,74,0.04)] transition-colors text-sm tracking-wider"
              placeholder="MIN 8 CHARACTERS"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#D4A44A] hover:bg-[#E0B35A] disabled:opacity-50 text-[#0C0C0C] font-medium rounded py-3 transition-colors text-sm tracking-[0.15em] uppercase mt-2"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-[11px] tracking-widest uppercase text-white/25">
          Have an account?{' '}
          <Link to="/login" className="text-[#D4A44A] hover:text-[#E0B35A] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
