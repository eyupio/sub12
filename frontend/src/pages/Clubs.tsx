import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, ChevronRight, X, Lock } from 'lucide-react'
import { clubsApi, type Club, type CreateClubInput } from '../api/clubs'
import { ApiError } from '../api/client'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { toast } from '../store/toast'

function CreateClubModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'invite_code' | 'approval'>('open')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (input: CreateClubInput) => clubsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast('Club created', 'success')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError && err.message ? err.message : 'Failed to create club. Please try again.'
      setError(msg)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      join_policy: joinPolicy,
    })
  }

  const toggleCls = (active: boolean) =>
    `flex-1 py-2 rounded border text-[11px] tracking-widest uppercase transition-colors ${
      active
        ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
        : 'border-subtle text-muted hover:text-secondary'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-club-modal-title"
        className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 id="new-club-modal-title" className="text-sm tracking-widest uppercase text-secondary">New Club</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Club Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Riverside Rifle Club"
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Description <span className="text-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A short description of your club"
              rows={2}
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Visibility</label>
            <div className="flex gap-3">
              {(['public', 'private'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={toggleCls(type === value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted">
              {type === 'private'
                ? 'Private clubs are hidden from the directory and only visible to members.'
                : 'Public clubs are listed in the directory and visible to everyone.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">How members join</label>
            <div className="space-y-1.5">
              {([
                { value: 'open' as const, label: 'Open', desc: 'Anyone can join' },
                { value: 'invite_code' as const, label: 'Invite Code', desc: 'Requires a code to join' },
                { value: 'approval' as const, label: 'Approval', desc: 'Admin must approve requests' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setJoinPolicy(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                    joinPolicy === opt.value
                      ? 'border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass)]'
                      : 'border-subtle text-muted hover:text-secondary'
                  }`}
                >
                  <span className="text-[11px] tracking-widest uppercase font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-inverse font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-opacity"
          >
            {mutation.isPending ? 'Creating…' : 'Create Club'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ClubCard({ club }: { club: Club }) {
  return (
    <Link
      to="/clubs/$id"
      params={{ id: club.id }}
      className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      {club.image_url ? (
        <img
          src={club.image_url}
          alt={club.name}
          className="w-9 h-9 rounded-lg object-cover border border-subtle shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-[var(--brass)]/10 border border-[var(--brass)]/20 flex items-center justify-center shrink-0">
          <Users size={16} className="text-[var(--brass)]/60" />
        </div>
      )}
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm text-secondary font-medium truncate">{club.name}</p>
          {club.type === 'private' && (
            <Lock size={11} className="text-muted shrink-0" aria-label="Private club" />
          )}
        </div>
        {club.description && (
          <p className="text-[11px] text-muted truncate">{club.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        <div className="flex items-center gap-1 text-muted">
          <Users size={13} />
          <span className="font-mono text-xs">{club.member_count}</span>
        </div>
        <ChevronRight size={16} className="text-muted" />
      </div>
    </Link>
  )
}

export default function Clubs() {
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list(),
  })

  return (
    <>
      <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Clubs</h1>
            <HelpIcon content={pageHelp.clubs} />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            <Plus size={14} />
            New
          </button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded border border-subtle bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-[var(--error-text)] text-sm">Failed to load clubs.</p>
        )}

        {data && data.items.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted text-sm tracking-widest uppercase">No clubs yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              Create the first one →
            </button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {data.items.map(club => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateClubModal onClose={() => setShowCreate(false)} />}
    </>
  )
}
