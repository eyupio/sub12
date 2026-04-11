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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#111111] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-widest uppercase text-white/80">New League</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-white/40">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Club Winter Series 2026"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A]/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] tracking-widest uppercase text-white/40">Description <span className="text-white/20">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this league for?"
              rows={2}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#D4A44A]/50 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-[#D4A44A] hover:bg-[#E0B35A] disabled:opacity-50 text-[#0C0C0C] font-medium text-[11px] tracking-widest uppercase py-3 rounded transition-colors"
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
      className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02] hover:border-[#D4A44A]/30 transition-colors"
    >
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm text-white/80 font-medium truncate">{league.name}</p>
        {league.description && (
          <p className="text-[11px] text-white/30 truncate">{league.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        <div className="flex items-center gap-1 text-white/30">
          <Users size={13} />
          <span className="font-mono text-xs">{league.member_count}</span>
        </div>
        <ChevronRight size={16} className="text-white/20" />
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
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Leagues</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors"
          >
            <Plus size={14} />
            New
          </button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded border border-white/[0.04] bg-white/[0.01] animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400 text-sm">Failed to load leagues.</p>
        )}

        {data && data.items.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-white/20 text-sm tracking-widest uppercase">No leagues yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-block text-[11px] tracking-widest uppercase text-[#D4A44A] hover:text-[#e0b45a] transition-colors"
            >
              Create the first one →
            </button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2">
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
