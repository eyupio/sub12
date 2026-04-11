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
    <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-5">
      <p className="text-[10px] tracking-widest uppercase text-muted">{label}</p>
      <p className={`text-2xl lg:text-3xl font-mono font-normal mt-1 ${gold ? 'text-[var(--brass)]' : 'text-secondary'}`}>
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
  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 placeholder-muted'

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Profile</h1>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>

      {/* Identity card */}
      <div className="bg-surface border border-subtle rounded-lg p-4 lg:p-6 space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={form.display_name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                className={inputCls}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                Bio
              </label>
              <textarea
                value={form.bio ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder="A few words about you"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={form.location ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Yorkshire"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted mb-1">
                  Club
                </label>
                <input
                  type="text"
                  value={form.club ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. YHFTA"
                />
              </div>
            </div>

            {error && <p className="text-[var(--error-text)] text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-40"
              >
                <Check size={13} />
                {mutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={mutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors disabled:opacity-40"
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-medium text-primary">{user?.display_name}</p>
            {user?.bio && <p className="text-sm text-secondary leading-relaxed">{user.bio}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {user?.location && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                  <MapPin size={12} />
                  {user.location}
                </span>
              )}
              {user?.club && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                  <Users size={12} />
                  {user.club}
                </span>
              )}
            </div>
            {!user?.bio && !user?.location && !user?.club && (
              <p className="text-[11px] text-muted tracking-wide">No bio yet — tap Edit to add one.</p>
            )}
          </>
        )}
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-[11px] tracking-widest uppercase text-muted mb-3">Stats</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Recent Cards</h2>
          {recentCards.length > 0 && (
            <Link
              to="/scores"
              className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
              See all →
            </Link>
          )}
        </div>

        {recentCards.length === 0 ? (
          <p className="text-sm text-muted tracking-wide">No cards logged yet.</p>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recentCards.map((card) => (
              <Link
                key={card.id}
                to="/scores/$id"
                params={{ id: card.id }}
                className="flex items-center justify-between p-3 lg:p-4 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
              >
                <div>
                  <p className="font-mono text-secondary text-sm">{card.shot_at}</p>
                  {card.location && (
                    <p className="text-[11px] text-muted">{card.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lg font-semibold text-primary">{card.total_score}</span>
                  {card.x_count > 0 && (
                    <span className="text-xs text-[var(--brass)]">{card.x_count}X</span>
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
