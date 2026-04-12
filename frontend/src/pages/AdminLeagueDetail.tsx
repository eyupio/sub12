import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2, X } from 'lucide-react'
import { adminLeaguesApi } from '../api/adminLeagues'
import type { League } from '../api/leagues'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 'text-[11px] tracking-widest uppercase text-muted'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const sectionCls = 'border border-subtle bg-surface rounded-lg p-4 lg:p-5 space-y-4'

function parseError(error: unknown) {
  if (!(error instanceof Error)) return 'Request failed.'
  const msg = error.message
  const match = msg.match(/\{.*\}$/)
  if (!match) return msg
  try {
    const parsed = JSON.parse(match[0]) as { error?: string }
    return parsed.error ?? msg
  } catch {
    return msg
  }
}

function ConfirmDeleteModal({ league, onConfirm, onCancel, isPending }: {
  league: League
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full sm:max-w-sm bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-widest uppercase text-secondary">Delete League</h2>
          <button onClick={onCancel} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-secondary">
          Permanently delete <strong className="text-primary">{league.name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending} className="bg-[var(--error-text)] hover:opacity-90 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminLeagueDetail() {
  const { id } = useParams({ from: '/app/admin/leagues/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: league, isLoading, error } = useQuery({
    queryKey: ['admin-league', id],
    queryFn: () => adminLeaguesApi.get(id),
  })

  useEffect(() => {
    if (!league) return
    const n = league.name
    const d = league.description ?? ''
    setName(n)
    setDescription(d)
    setSavedSnapshot(JSON.stringify({ name: n, description: d }))
  }, [league])

  const { data: membersData } = useQuery({
    queryKey: ['admin-league-members', id],
    queryFn: () => adminLeaguesApi.listMembers(id),
  })

  const members = membersData?.items ?? []

  const isDirty = useMemo(
    () => JSON.stringify({ name, description }) !== savedSnapshot,
    [name, description, savedSnapshot],
  )

  const saveMutation = useMutation({
    mutationFn: () => adminLeaguesApi.update(id, {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-league', id], updated)
      queryClient.invalidateQueries({ queryKey: ['admin-leagues'] })
      const n = updated.name
      const d = updated.description ?? ''
      setName(n)
      setDescription(d)
      setSavedSnapshot(JSON.stringify({ name: n, description: d }))
      setSaveOk('Saved')
      setTimeout(() => setSaveOk(null), 2500)
    },
    onError: (err) => {
      setSaveErr(parseError(err))
      setTimeout(() => setSaveErr(null), 2500)
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => adminLeaguesApi.removeMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-league-members', id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => adminLeaguesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leagues'] })
      navigate({ to: '/admin/leagues' })
    },
    onError: (err) => {
      setShowDeleteModal(false)
      setSaveErr(parseError(err))
      setTimeout(() => setSaveErr(null), 2500)
    },
  })

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        <div className="h-6 w-32 rounded bg-surface animate-pulse" />
        <div className="h-40 rounded bg-surface animate-pulse" />
      </div>
    )
  }

  if (error || !league) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <p className="text-[var(--error-text)] text-sm">{error ? parseError(error) : 'League not found.'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-6">
      <Link
        to="/admin/leagues"
        className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
      >
        <ChevronLeft size={14} />
        All Leagues
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-medium text-primary">{league.name}</h1>
          <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded ${league.type === 'private' ? 'bg-surface text-muted border border-subtle' : 'bg-[var(--brass)]/10 text-[var(--brass)]'}`}>
            {league.type}
          </span>
        </div>
        <p className="text-xs text-muted mt-0.5">{league.member_count} members</p>
      </div>

      {/* Edit form */}
      <div className={sectionCls}>
        <h2 className="text-xs tracking-widest uppercase text-secondary">Settings</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
            className={btnPrimary}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          {saveOk && <span className="text-xs text-[var(--success-text)]">{saveOk}</span>}
          {saveErr && <span className="text-xs text-[var(--error-text)]">{saveErr}</span>}
        </div>
      </div>

      {/* Members */}
      <div className={sectionCls}>
        <h2 className="text-xs tracking-widest uppercase text-secondary">Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">No members.</p>
        ) : (
          <div className="divide-y divide-subtle">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-primary">{m.display_name}</span>
                    {m.is_admin && (
                      <span className="text-[9px] tracking-widest uppercase bg-[var(--brass)]/10 text-[var(--brass)] px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">Joined {new Date(m.joined_at).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => removeMemberMutation.mutate(m.user_id)}
                  disabled={removeMemberMutation.isPending}
                  className="text-muted hover:text-[var(--error-text)] transition-colors p-1"
                  title="Remove member"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className={`${sectionCls} border-[var(--error-border)]`}>
        <h2 className="text-xs tracking-widest uppercase text-[var(--error-text)]">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Delete this league</p>
            <p className="text-xs text-muted">This action is permanent and cannot be undone.</p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="border border-[var(--error-border)] text-[var(--error-text)] hover:bg-[var(--error-bg)] text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors"
          >
            Delete League
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          league={league}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteModal(false)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
