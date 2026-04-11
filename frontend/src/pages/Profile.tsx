import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, X, Check, MapPin, Users } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { statsApi } from '../api/stats'
import { scoreCardApi } from '../api/scoreCards'
import { usersApi, UpdateProfileInput } from '../api/users'

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
      <p className="text-[10px] tracking-widest uppercase text-white/30">{label}</p>
      <p className={`text-2xl font-mono font-normal mt-1 ${gold ? 'text-[#D4A44A]' : 'text-white/80'}`}>
        {value}
      </p>
    </div>
  )
}

export default function Profile() {
  const { user, updateUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<UpdateProfileInput>({})
  const [error, setError] = useState<string | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getMe(),
  })

  const { data: history } = useQuery({
    queryKey: ['score-cards'],
    queryFn: () => scoreCardApi.list(5, 0),
  })

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      updateUser({
        display_name: updated.display_name,
        bio: updated.bio,
        location: updated.location,
        club: updated.club,
        avatar_url: updated.avatar_url,
      })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setEditing(false)
      setError(null)
    },
    onError: () => {
      setError('Failed to save changes. Please try again.')
    },
  })

  function startEdit() {
    setForm({
      display_name: user?.display_name ?? '',
      bio: user?.bio ?? '',
      location: user?.location ?? '',
      club: user?.club ?? '',
    })
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
  }

  function handleSave() {
    const input: UpdateProfileInput = {}
    if (form.display_name !== undefined) input.display_name = form.display_name || undefined
    if (form.bio !== undefined) input.bio = form.bio || undefined
    if (form.location !== undefined) input.location = form.location || undefined
    if (form.club !== undefined) input.club = form.club || undefined
    mutation.mutate(input)
  }

  const recentCards = history?.items ?? []

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Profile</h1>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-white/30 hover:text-white/60 transition-colors"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>

      {/* Identity card */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-white/30 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={form.display_name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#D4A44A]/50 placeholder-white/20"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-white/30 mb-1">
                Bio
              </label>
              <textarea
                value={form.bio ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                rows={2}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#D4A44A]/50 placeholder-white/20 resize-none"
                placeholder="A few words about you"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-white/30 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={form.location ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#D4A44A]/50 placeholder-white/20"
                  placeholder="e.g. Yorkshire"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-white/30 mb-1">
                  Club
                </label>
                <input
                  type="text"
                  value={form.club ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#D4A44A]/50 placeholder-white/20"
                  placeholder="e.g. YHFTA"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#D4A44A]/20 border border-[#D4A44A]/30 text-[11px] tracking-widest uppercase text-[#D4A44A] hover:bg-[#D4A44A]/30 transition-colors disabled:opacity-40"
              >
                <Check size={13} />
                {mutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={mutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[11px] tracking-widest uppercase text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-medium text-white/90">{user?.display_name}</p>
            {user?.bio && <p className="text-sm text-white/50 leading-relaxed">{user.bio}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {user?.location && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/35 tracking-wide">
                  <MapPin size={12} />
                  {user.location}
                </span>
              )}
              {user?.club && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/35 tracking-wide">
                  <Users size={12} />
                  {user.club}
                </span>
              )}
            </div>
            {!user?.bio && !user?.location && !user?.club && (
              <p className="text-[11px] text-white/20 tracking-wide">No bio yet — tap Edit to add one.</p>
            )}
          </>
        )}
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-[11px] tracking-widest uppercase text-white/40 mb-3">Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Best Score"
            value={stats?.best_score != null ? String(stats.best_score) : '—'}
            gold
          />
          <StatCard
            label="Best X Count"
            value={stats?.best_x_count != null ? String(stats.best_x_count) : '—'}
            gold
          />
          <StatCard label="Cards Logged" value={stats ? String(stats.cards_logged) : '—'} />
          <StatCard
            label="Avg Score"
            value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
          />
        </div>
      </div>

      {/* Recent cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] tracking-widest uppercase text-white/40">Recent Cards</h2>
          {recentCards.length > 0 && (
            <Link
              to="/scores"
              className="text-[11px] tracking-widest uppercase text-white/25 hover:text-white/50 transition-colors"
            >
              See all →
            </Link>
          )}
        </div>

        {recentCards.length === 0 ? (
          <p className="text-sm text-white/25 tracking-wide">No cards logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recentCards.map((card) => (
              <Link
                key={card.id}
                to="/scores/$id"
                params={{ id: card.id }}
                className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02] hover:border-[#D4A44A]/30 transition-colors"
              >
                <div>
                  <p className="font-mono text-white/70 text-sm">{card.shot_at}</p>
                  {card.location && (
                    <p className="text-[11px] text-white/25">{card.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-white">{card.total_score}</span>
                  {card.x_count > 0 && (
                    <span className="text-xs text-[#D4A44A]">{card.x_count}X</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
