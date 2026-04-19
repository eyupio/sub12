import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Download, Lock, ShieldOff, Trash2 } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { usersApi } from '../api/users'
import { privacyApi } from '../api/privacy'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

type VisibilityOption = 'public' | 'followers' | 'private'

export default function PrivacyCenter() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [deleteConfirm, setDeleteConfirm] = useState('')

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

  const exportMutation = useMutation({
    mutationFn: () => usersApi.exportMe(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sub12-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Download started', 'success')
    },
    onError: () => toast('Failed to export data', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteMe(),
    onSuccess: () => {
      toast('Your account has been deleted', 'success')
      clearAuth()
      navigate({ to: '/' })
    },
    onError: () => toast('Failed to delete account', 'error'),
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
        <HelpIcon content={pageHelp.privacy} />
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
          className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
            {mutes?.items.map((m) => (
              <li key={m.muted_id} className="flex items-center justify-between gap-2">
                <Link
                  to="/users/$id"
                  params={{ id: m.muted_id }}
                  className="flex items-center gap-2 text-sm text-secondary truncate hover:text-[var(--brass)]"
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-surface-hover" />
                  )}
                  <span className="truncate">{m.display_name || m.muted_id}</span>
                </Link>
                <button
                  onClick={() => unmuteMutation.mutate(m.muted_id)}
                  className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80"
                >
                  Unmute
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 p-4 rounded border border-subtle bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-muted flex items-center gap-2">
          <Download size={12} /> Your data
        </h2>
        <p className="text-xs text-muted">
          Download a JSON copy of your profile, score cards, posts, clubs and leagues.
        </p>
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-secondary hover:text-[var(--brass)] hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exportMutation.isPending ? 'Preparing…' : 'Download my data'}
        </button>
      </section>

      <section className="space-y-3 p-4 rounded border border-[var(--error-text)]/30 bg-surface">
        <h2 className="text-[11px] tracking-widest uppercase text-[var(--error-text)] flex items-center gap-2">
          <Trash2 size={12} /> Delete my account
        </h2>
        <p className="text-xs text-muted">
          Permanent. Your profile is removed, your score cards become anonymous, and you will no
          longer appear in other users' feeds or lists. Type <span className="font-mono">DELETE</span> to confirm.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="flex-1 bg-page border border-subtle rounded px-2 py-1.5 text-sm text-secondary focus:outline-none focus:border-[var(--error-text)]/40"
          />
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteConfirm !== 'DELETE' || deleteMutation.isPending}
            className="px-3 py-1.5 rounded bg-[var(--error-text)] text-white text-[11px] tracking-widest uppercase font-medium disabled:opacity-30"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </section>
    </div>
  )
}
