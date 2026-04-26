import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X } from 'lucide-react'
import { adminUsersApi, type AdminUser } from '../api/adminUsers'
import { useAuthStore } from '../store/auth'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { UserAvatar } from '../components/UserAvatar'

const labelCls = 't-section-title'
const btnPrimary = 'bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity'
const btnDanger = 'border border-[var(--error-border)] text-[var(--error-text)] hover:bg-[var(--error-bg)] text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors'
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

function ConfirmDeleteModal({ user, onConfirm, onCancel, isPending }: {
  user: AdminUser
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full sm:max-w-sm bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="t-section-title">Delete User</h2>
          <button onClick={onCancel} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-secondary">
          Permanently delete <strong className="text-primary">{user.display_name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="border border-subtle hover:border-strong text-secondary hover:text-primary text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending} className="bg-[var(--error-text)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUserDetail() {
  const { id } = useParams({ from: '/app/admin/users/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const prefs = useRegionalPrefs()

  const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>('user')
  const [roleOk, setRoleOk] = useState<string | null>(null)
  const [roleErr, setRoleErr] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => adminUsersApi.get(id),
  })

  useEffect(() => {
    if (!user) return
    setSelectedRole(user.role)
  }, [user])

  const roleMutation = useMutation({
    mutationFn: () => adminUsersApi.updateRole(id, selectedRole),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-user', id], updated)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setRoleOk('Role updated')
      setTimeout(() => setRoleOk(null), 2500)
    },
    onError: (err) => {
      setRoleErr(parseError(err))
      setTimeout(() => setRoleErr(null), 2500)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => adminUsersApi.delete(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['admin-user', id] })
      queryClient.setQueriesData<{ items: AdminUser[], total: number, limit: number, offset: number }>(
        { queryKey: ['admin-users'] },
        (current) => current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      )
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      navigate({ to: '/admin/users' })
    },
    onError: (err) => {
      setShowDeleteModal(false)
      setRoleErr(parseError(err))
      setTimeout(() => setRoleErr(null), 2500)
    },
  })

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        <div className="h-6 w-32 rounded bg-surface animate-pulse" />
        <div className="h-40 rounded bg-surface animate-pulse" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <p className="text-[var(--error-text)] text-sm">{error ? parseError(error) : 'User not found.'}</p>
      </div>
    )
  }

  const isSelf = currentUser?.id === id

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-6">
      <Link
        to="/admin/users"
        className="flex items-center gap-1 t-section-title hover:text-secondary transition-colors"
      >
        <ChevronLeft size={14} />
        All Users
      </Link>

      {/* Profile card */}
      <div className={sectionCls}>
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size={48} variant="brass" className="shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-primary">{user.display_name}</span>
              <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded ${user.role === 'admin' ? 'bg-[var(--brass)]/10 text-[var(--brass)]' : 'bg-surface text-muted border border-subtle'}`}>
                {user.role}
              </span>
            </div>
            <span className="text-xs text-muted">{user.email}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-subtle">
          {user.location && (
            <div className="space-y-0.5">
              <p className={labelCls}>Location</p>
              <p className="text-sm text-secondary">{user.location}</p>
            </div>
          )}
          {user.club && (
            <div className="space-y-0.5">
              <p className={labelCls}>Club</p>
              <p className="text-sm text-secondary">{user.club}</p>
            </div>
          )}
          <div className="space-y-0.5">
            <p className={labelCls}>Joined</p>
            <p className="text-sm text-secondary">{formatDate(user.created_at, prefs)}</p>
          </div>
        </div>

        {user.bio && (
          <div className="space-y-0.5 pt-2 border-t border-subtle">
            <p className={labelCls}>Bio</p>
            <p className="text-sm text-secondary">{user.bio}</p>
          </div>
        )}
      </div>

      {/* Role management */}
      <div className={sectionCls}>
        <h2 className="t-section-title">Role</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value as 'user' | 'admin')}
            disabled={isSelf}
            className="bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={() => roleMutation.mutate()}
            disabled={roleMutation.isPending || isSelf || selectedRole === user.role}
            className={btnPrimary}
          >
            {roleMutation.isPending ? 'Saving…' : 'Change Role'}
          </button>
        </div>
        {isSelf && <p className="text-xs text-muted">You cannot change your own role.</p>}
        {roleOk && <p className="text-xs text-[var(--success-text)]">{roleOk}</p>}
        {roleErr && <p className="text-xs text-[var(--error-text)]">{roleErr}</p>}
      </div>

      {/* Danger zone */}
      <div className={sectionCls}>
        <h2 className="t-section-title text-[var(--error-text)]">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Delete this user</p>
            <p className="text-xs text-muted">This action is permanent and cannot be undone.</p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={isSelf}
            className={btnDanger}
          >
            Delete User
          </button>
        </div>
        {isSelf && <p className="text-xs text-muted">You cannot delete your own account.</p>}
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          user={user}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteModal(false)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
