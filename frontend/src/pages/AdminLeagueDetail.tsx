import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2, UserPlus, X } from 'lucide-react'
import { adminLeaguesApi } from '../api/adminLeagues'
import { adminSimulationApi, type SimulatedPersona } from '../api/adminSimulation'
import type { League } from '../api/leagues'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { SkeletonList } from '../components/Skeleton'

const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'
const labelCls = 't-section-title'
const btnPrimary = 'btn-brass disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-all'
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
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full sm:max-w-sm bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="t-section-title">Delete League</h2>
          <button onClick={onCancel} aria-label="Close" className="text-muted hover:text-secondary transition-colors">
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
          <button onClick={onConfirm} disabled={isPending} className="bg-[var(--error-text)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-2.5 px-4 rounded transition-opacity">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddSimulatedMemberDialog({ leagueId, pending, onAdd, onCancel }: {
  leagueId: string
  pending: boolean
  onAdd: (personaId: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState('')

  const { data: personasData, isLoading } = useQuery({
    queryKey: ['simulation-personas-for-league', leagueId],
    queryFn: () => adminSimulationApi.listPersonas(100, 0),
    retry: false,
  })

  useEffect(() => { setSelected('') }, [leagueId])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const personas: SimulatedPersona[] = personasData?.items ?? []

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-[var(--brass)]" />
            <h2 className="t-section-title">Add Simulated Account</h2>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted">
          Enrol a simulated persona directly, bypassing the join policy, so it can interact with the league's content.
        </p>
        {isLoading ? (
          <SkeletonList count={3} />
        ) : personas.length === 0 ? (
          <p className="text-sm text-muted">No simulated personas available.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {personas.map(p => (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                  selected === p.id ? 'border-[var(--brass)]/50 bg-[var(--brass)]/5' : 'border-subtle hover:border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="sim-persona"
                  checked={selected === p.id}
                  onChange={() => setSelected(p.id)}
                  className="accent-[var(--brass)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-primary truncate">{p.display_name}</div>
                  {p.location && <div className="text-xs text-muted truncate">{p.location}</div>}
                </div>
                <span className="text-xs text-muted">{p.card_count} cards</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border border-subtle text-sm text-muted hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onAdd(selected)}
            disabled={pending || !selected}
            className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Adding…' : 'Add to League'}
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
  const prefs = useRegionalPrefs()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)

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

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => adminLeaguesApi.addMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-league-members', id] })
      setShowAddMemberModal(false)
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
        <div className="h-6 w-32 rounded skeleton" />
        <div className="h-40 rounded skeleton" />
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
        className="flex items-center gap-1 t-section-title hover:text-secondary transition-colors"
      >
        <ChevronLeft size={14} />
        All Leagues
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="t-page-title">{league.name}</h1>
          <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded ${league.type === 'private' ? 'bg-surface text-muted border border-subtle' : 'bg-[var(--brass)]/10 text-[var(--brass)]'}`}>
            {league.type}
          </span>
        </div>
        <p className="text-xs text-muted mt-0.5">{league.member_count} members</p>
      </div>

      {/* Edit form */}
      <div className={sectionCls}>
        <h2 className="t-section-title">Settings</h2>
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
        <div className="flex items-center justify-between">
          <h2 className="t-section-title">Members ({members.length})</h2>
          <button
            onClick={() => setShowAddMemberModal(true)}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            <UserPlus size={14} />
            Add
          </button>
        </div>
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
                  <span className="text-xs text-muted">Joined {formatDate(m.joined_at, prefs)}</span>
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
        <h2 className="t-section-title text-[var(--error-text)]">Danger Zone</h2>
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

      {showAddMemberModal && (
        <AddSimulatedMemberDialog
          leagueId={id}
          pending={addMemberMutation.isPending}
          onAdd={(personaId) => addMemberMutation.mutate(personaId)}
          onCancel={() => setShowAddMemberModal(false)}
        />
      )}
    </div>
  )
}
