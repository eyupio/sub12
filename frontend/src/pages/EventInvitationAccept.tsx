import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Calendar, Check, MapPin, X } from 'lucide-react'
import { eventInvitationsApi } from '../api/eventInvitations'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'

export default function EventInvitationAccept() {
  const params = useParams({ strict: false }) as { token?: string }
  const token = params.token ?? ''
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user && typeof window !== 'undefined') {
      const next = `/events/invitations/${token}`
      window.location.href = `/login?next=${encodeURIComponent(next)}`
    }
  }, [user, token])

  const { data, isLoading, error } = useQuery({
    queryKey: ['event-invitation', token],
    queryFn: () => eventInvitationsApi.getByToken(token),
    enabled: !!token && !!user,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => eventInvitationsApi.accept(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-invitation', token] })
      toast('You’re in. See you there!', 'success')
      if (data?.event.slug) {
        navigate({ to: '/events/$slug', params: { slug: data.event.slug } })
      }
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to accept invitation', 'error'),
  })

  const decline = useMutation({
    mutationFn: () => eventInvitationsApi.decline(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-invitation', token] })
      toast('Invitation declined', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to decline invitation', 'error'),
  })

  if (!user) return null

  return (
    <div className="bg-bg min-h-screen">
      <div className="p-4 lg:p-8 max-w-2xl mx-auto pb-32 space-y-5">
        <h1 className="t-page-title">Event invitation</h1>

        {isLoading && <p className="text-sm text-muted">Loading invitation…</p>}
        {error && (
          <div className="bg-surface border border-line rounded-lg p-5 shadow-card">
            <p className="text-sm text-[var(--error-text)]">
              {error instanceof Error ? error.message : 'Could not load invitation.'}
            </p>
          </div>
        )}

        {data && (
          <div className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
            <header className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted">
                {data.inviter.display_name} invited you to
              </p>
              <h2 className="t-subsection-title">{data.event.name}</h2>
              <p className="text-sm text-muted">{data.event.discipline}</p>
            </header>

            <div className="space-y-2 text-sm">
              {data.event.starts_at && (
                <div className="flex items-center gap-2 text-secondary">
                  <Calendar size={14} className="opacity-70" />
                  {new Date(data.event.starts_at).toLocaleString()}
                </div>
              )}
              {data.event.location && (
                <div className="flex items-center gap-2 text-secondary">
                  <MapPin size={14} className="opacity-70" />
                  {data.event.location}
                </div>
              )}
            </div>

            {data.invitation.status === 'pending' && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gold text-inverse text-xs uppercase tracking-widest font-medium hover:opacity-95 disabled:opacity-50"
                >
                  <Check size={13} /> {accept.isPending ? 'Accepting…' : 'Accept & join'}
                </button>
                <button
                  type="button"
                  onClick={() => decline.mutate()}
                  disabled={decline.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-line text-xs uppercase tracking-widest text-ink-2 hover:border-gold/40 disabled:opacity-50"
                >
                  <X size={13} /> Decline
                </button>
              </div>
            )}

            {data.invitation.status === 'accepted' && (
              <p className="text-sm text-secondary">You’ve already accepted this invitation.</p>
            )}
            {data.invitation.status === 'declined' && (
              <p className="text-sm text-secondary">You declined this invitation.</p>
            )}
            {data.invitation.status === 'expired' && (
              <p className="text-sm text-secondary">This invitation has expired.</p>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate({ to: '/events/$slug', params: { slug: data.event.slug } })}
                className="text-xs uppercase tracking-widest text-muted hover:text-ink-2"
              >
                View event details →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
