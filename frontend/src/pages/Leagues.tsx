import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, ChevronRight, X } from 'lucide-react'
import { leagueApi, CreateLeaguePayload } from '../api/leagues'

function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaguePayload) => leagueApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      onClose()
    },
    onError: () => setError('Failed to create league. Please try again.'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    mutation.mutate({ name: name.trim(), description: description.trim() || undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card border border-subtle rounded-t-2xl sm:rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-widest uppercase text-secondary">New League</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Club Winter Series 2026"
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-muted">Description <span className="text-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this league for?"
              rows={2}
              className="w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-opacity"
          >
            {mutation.isPending ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  )
}

function LeagueRow({ league }: { league: import('../api/leagues').League }) {
  return (
    <Link
      to="/leagues/$id"
      params={{ id: league.id }}
      className="flex items-center gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
    >
      {league.image_url && (
        <img
          src={league.image_url}
          alt={league.name}
          className="w-9 h-9 rounded-lg object-cover border border-subtle shrink-0"
        />
      )}
      <div className="space-y-0.5 min-w-0 flex-1">
        <p className="text-sm text-secondary font-medium truncate">{league.name}</p>
        {league.description && (
          <p className="text-[11px] text-muted truncate">{league.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        <div className="flex items-center gap-1 text-muted">
          <Users size={13} />
          <span className="font-mono text-xs">{league.member_count}</span>
        </div>
        <ChevronRight size={16} className="text-muted" />
      </div>
    </Link>
  )
}

export default function Leagues() {
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leagueApi.list(),
  })

  return (
    <>
      <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Leagues</h1>
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
          <p className="text-[var(--error-text)] text-sm">Failed to load leagues.</p>
        )}

        {data && data.items.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted text-sm tracking-widest uppercase">No leagues yet</p>
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
            {data.items.map(league => (
              <LeagueRow key={league.id} league={league} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateLeagueModal onClose={() => setShowCreate(false)} />}
    </>
  )
}
