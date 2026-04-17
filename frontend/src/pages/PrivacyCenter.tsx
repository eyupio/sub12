import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Lock, ShieldOff } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { usersApi } from '../api/users'
import { privacyApi } from '../api/privacy'

type VisibilityOption = 'public' | 'followers' | 'private'

export default function PrivacyCenter() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  const [profileVisibility, setProfileVisibility] = useState(user?.profile_visibility ?? 'public')
  const [defaultScoreVisibility, setDefaultScoreVisibility] = useState<VisibilityOption>(
    (user?.default_score_visibility as VisibilityOption) ?? 'public',
  )
  const [feedOptOut, setFeedOptOut] = useState<boolean>(user?.feed_opt_out ?? false)
  const [showFollowerCounts, setShowFollowerCounts] = useState<boolean>(user?.show_follower_counts ?? true)

  useEffect(() => {
    if (!user) return
    setProfileVisibility(user.profile_visibility ?? 'public')
    setDefaultScoreVisibility((user.default_score_visibility as VisibilityOption) ?? 'public')
    setFeedOptOut(user.feed_opt_out ?? false)
    setShowFollowerCounts(user.show_follower_counts ?? true)
  }, [user])

  const updateMutation = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        profile_visibility: profileVisibility,
        default_score_visibility: defaultScoreVisibility,
        feed_opt_out: feedOptOut,
        show_follower_counts: showFollowerCounts,
      }),
    onSuccess: (updated) => {
      updateUser({
        profile_visibility: updated.profile_visibility,
        default_score_visibility: updated.default_score_visibility,
        feed_opt_out: updated.feed_opt_out,
        show_follower_counts: updated.show_follower_counts,
      })
      toast('Privacy settings saved', 'success')
    },
    onError: () => toast('Failed to save settings', 'error'),
  })

  const { data: blocks } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => usersApi.listBlocked(),
  })

  const { data: mutes } = useQuery({
    queryKey: ['mutes'],
    queryFn: () => privacyApi.listMuted(),
  })

  const unblockMutation = useMutation({
    mutationFn: (id: string) => usersApi.unblock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks'] })
      toast('User unblocked', 'success')
    },
  })

  const unmuteMutation = useMutation({
    mutationFn: (id: string) => privacyApi.unmute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mutes'] })
      toast('User unmuted', 'success')
    },
  })

  if (!user) return null

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          className="text-muted hover:text-secondary transition-colors"
          aria-label="Back to profile"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Privacy</h1>
      </div>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Profile</h2>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={profileVisibility === 'private'}
            onChange={(e) => setProfileVisibility(e.target.checked ? 'private' : 'public')}
            className="mt-1"
          />
          <span className="text-sm text-secondary">
            <span className="flex items-center gap-1 font-medium"><Lock size={12} /> Private profile</span>
            <span className="text-xs text-muted block">Bio, location, club and achievements are hidden behind a follow request.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!showFollowerCounts}
            onChange={(e) => setShowFollowerCounts(!e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-secondary">
            <span className="font-medium">Hide follower / following counts</span>
            <span className="text-xs text-muted block">Still visible to you; other people see a dash.</span>
          </span>
        </label>
      </section>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">New score cards</h2>
        <div className="flex gap-1.5 flex-wrap">
          {(['public', 'followers', 'private'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setDefaultScoreVisibility(v)}
              aria-pressed={defaultScoreVisibility === v}
              className={`px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
                defaultScoreVisibility === v
                  ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                  : 'border-subtle text-muted hover:text-secondary hover:border-[var(--brass)]/20'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Feed</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={feedOptOut}
            onChange={(e) => setFeedOptOut(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-secondary">
            <span className="font-medium">Hide my activity from the public feed</span>
            <span className="text-xs text-muted block">Your followers still see your activity in their personalised feed.</span>
          </span>
        </label>
      </section>

      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-40"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted flex items-center gap-2">
          <ShieldOff size={12} /> Blocked users
        </h2>
        {blocks?.items.length === 0 ? (
          <p className="text-xs text-muted">You haven't blocked anyone.</p>
        ) : (
          <ul className="space-y-2">
            {blocks?.items.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-secondary truncate">{b.display_name}</span>
                <button
                  onClick={() => unblockMutation.mutate(b.blocked_id)}
                  className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted">Muted users</h2>
        {mutes?.items.length === 0 ? (
          <p className="text-xs text-muted">You haven't muted anyone.</p>
        ) : (
          <ul className="space-y-2">
            {mutes?.items.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <Link to="/users/$id" params={{ id }} className="text-sm text-secondary truncate hover:text-[var(--brass)]">
                  {id}
                </Link>
                <button
                  onClick={() => unmuteMutation.mutate(id)}
                  className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80"
                >
                  Unmute
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
