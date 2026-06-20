import { useState, useEffect } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/auth'

export default function ConfirmEmail() {
  const search = useSearch({ strict: false }) as { token?: string }
  const { clearAuth } = useAuthStore()
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: (token: string) => usersApi.confirmEmailChange(token),
    onSuccess: () => {
      clearAuth()
      setDone(true)
    },
  })

  useEffect(() => {
    if (search.token && !done && !mutation.isPending && !mutation.isError) {
      mutation.mutate(search.token)
    }
  }, [search.token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6 max-w-md mx-auto space-y-6 text-center">
      <h1 className="t-page-title">Confirm Email Change</h1>

      {mutation.isPending && (
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Confirming your new email address…</p>
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle size={32} className="text-[var(--brass)]" />
          <p className="text-sm text-secondary">Your email has been updated successfully.</p>
          <p className="text-xs text-muted">Please sign in again with your new email address.</p>
          <Link
            to="/login"
            className="mt-2 px-4 py-2 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}

      {mutation.isError && (
        <div className="flex flex-col items-center gap-3">
          <XCircle size={32} className="text-[var(--error-text)]" />
          <p className="text-sm text-[var(--error-text)]">
            {mutation.error instanceof Error ? mutation.error.message : 'Invalid or expired confirmation link.'}
          </p>
          <Link
            to="/profile"
            className="mt-2 px-4 py-2 rounded border border-subtle t-section-title hover:text-secondary transition-colors"
          >
            Back to Profile
          </Link>
        </div>
      )}

      {!search.token && !mutation.isPending && !done && !mutation.isError && (
        <p className="text-sm text-muted">No confirmation token provided.</p>
      )}
    </div>
  )
}
