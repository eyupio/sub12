import { useRef, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Copy, Check, Trash2, ImagePlus, Medal, Trophy, Plus } from 'lucide-react'
import { clubsApi, type ClubStanding, type ClubMember } from '../api/clubs'
import { postApi } from '../api/posts'
import type { League } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { PostCard } from '../components/PostCard'
import { PostComposer } from '../components/PostComposer'

function StandingsTable({ standings }: { standings: ClubStanding[] }) {
  if (standings.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-8">
        No scores yet — members need to log verified score cards.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-subtle">
            <th className="pb-2 pr-4 text-[10px] tracking-widest uppercase text-muted font-normal w-8">#</th>
            <th className="pb-2 pr-4 text-[10px] tracking-widest uppercase text-muted font-normal">Shooter</th>
            <th className="pb-2 pr-4 text-[10px] tracking-widest uppercase text-muted font-normal text-right">Best</th>
            <th className="pb-2 pr-4 text-[10px] tracking-widest uppercase text-muted font-normal text-right">X</th>
            <th className="pb-2 text-[10px] tracking-widest uppercase text-muted font-normal text-right">Cards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {standings.map(s => (
            <tr key={s.user_id} className="hover:bg-surface/50 transition-colors">
              <td className="py-2.5 pr-4 font-mono text-xs text-muted">{s.rank}</td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[var(--brass)]/10 flex items-center justify-center">
                      <span className="text-[9px] text-[var(--brass)]">{s.display_name[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <span className="text-secondary truncate max-w-[140px]">{s.display_name}</span>
                  {s.rank === 1 && <Medal size={12} className="text-[var(--brass)] shrink-0" />}
                </div>
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-right text-secondary">{s.best_score ?? '—'}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-right text-muted">{s.best_x ?? '—'}</td>
              <td className="py-2.5 font-mono text-xs text-right text-muted">{s.card_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MemberRow({ member, clubId, isAdmin, onRemoved }: {
  member: ClubMember
  clubId: string
  isAdmin: boolean
  onRemoved: () => void
}) {
  const queryClient = useQueryClient()
  const removeMutation = useMutation({
    mutationFn: () => clubsApi.removeMember(clubId, member.user_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      onRemoved()
    },
  })

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-subtle last:border-0">
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-[var(--brass)]/10 flex items-center justify-center shrink-0">
          <span className="text-[10px] text-[var(--brass)]">{member.display_name[0]?.toUpperCase()}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-secondary truncate">{member.display_name}</p>
        <p className="text-[10px] text-muted">Joined {member.joined_at.slice(0, 10)}</p>
      </div>
      {member.is_admin && (
        <span className="text-[9px] tracking-widest uppercase border border-[var(--brass)]/30 text-[var(--brass)] px-1.5 py-0.5 rounded">
          Admin
        </span>
      )}
      {isAdmin && !member.is_admin && (
        <button
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50"
          title="Remove member"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

export default function ClubDetail() {
  const { id } = useParams({ from: '/app/clubs/$id' })
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [joinError, setJoinError] = useState('')

  const { data: club, isLoading } = useQuery({
    queryKey: ['club', id],
    queryFn: () => clubsApi.get(id),
  })

  const { data: standingsData } = useQuery({
    queryKey: ['club', id, 'standings'],
    queryFn: () => clubsApi.getStandings(id),
    enabled: !!id,
  })

  const { data: membersData } = useQuery({
    queryKey: ['club', id, 'members'],
    queryFn: () => clubsApi.listMembers(id),
    enabled: !!club?.is_member,
  })

  const { data: leaguesData } = useQuery({
    queryKey: ['club', id, 'leagues'],
    queryFn: () => clubsApi.listLeagues(id),
    enabled: !!id,
  })

  const [showCreateLeague, setShowCreateLeague] = useState(false)
  const [newLeagueName, setNewLeagueName] = useState('')
  const [newLeagueDesc, setNewLeagueDesc] = useState('')
  const [newLeagueType, setNewLeagueType] = useState<'public' | 'private'>('public')

  const createLeagueMutation = useMutation({
    mutationFn: () => clubsApi.createLeague(id, { name: newLeagueName, description: newLeagueDesc || undefined, type: newLeagueType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', id, 'leagues'] })
      setShowCreateLeague(false)
      setNewLeagueName('')
      setNewLeagueDesc('')
      setNewLeagueType('public')
    },
  })

  const joinMutation = useMutation({
    mutationFn: () => clubsApi.join(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', id] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
    },
    onError: () => setJoinError('Failed to join club. You may already be a member.'),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => clubsApi.uploadImage(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['club', id] }),
  })

  function copyJoinCode() {
    if (!club) return
    navigator.clipboard.writeText(club.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-4xl mx-auto">
        <div className="h-24 rounded border border-subtle bg-surface animate-pulse" />
        <div className="h-48 rounded border border-subtle bg-surface animate-pulse" />
      </div>
    )
  }

  if (!club) {
    return (
      <div className="p-4 lg:p-8 text-center text-muted text-sm">
        Club not found.
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {club.image_url ? (
            <img
              src={club.image_url}
              alt={club.name}
              className="w-16 h-16 rounded-xl object-cover border border-subtle"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[var(--brass)]/10 border border-[var(--brass)]/20 flex items-center justify-center">
              <Users size={28} className="text-[var(--brass)]/60" />
            </div>
          )}
          {club.is_admin && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-card border border-subtle flex items-center justify-center text-muted hover:text-secondary transition-colors"
                title="Upload club image"
              >
                <ImagePlus size={11} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary truncate">
            {club.name}
          </h1>
          {club.description && (
            <p className="text-sm text-muted">{club.description}</p>
          )}
          <div className="flex items-center gap-1 text-muted">
            <Users size={13} />
            <span className="text-xs">{club.member_count} member{club.member_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          {!club.is_member && user && (
            <div className="space-y-1">
              <button
                onClick={() => { setJoinError(''); joinMutation.mutate() }}
                disabled={joinMutation.isPending}
                className="px-4 py-1.5 bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse text-[11px] tracking-widest uppercase rounded transition-opacity"
              >
                {joinMutation.isPending ? 'Joining…' : 'Join'}
              </button>
              {joinError && <p className="text-[10px] text-[var(--error-text)] text-right">{joinError}</p>}
            </div>
          )}
          {club.is_admin && (
            <button
              onClick={copyJoinCode}
              className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
              title="Copy join code"
            >
              {copied ? <Check size={12} className="text-[var(--success-text)]" /> : <Copy size={12} />}
              {copied ? 'Copied!' : `Code: ${club.join_code}`}
            </button>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
        {/* Standings */}
        <div className="space-y-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted border-b border-subtle pb-2">
            Top Performers
          </h2>
          <StandingsTable standings={standingsData?.items ?? []} />
        </div>

        {/* Members */}
        <div className="space-y-3">
          <h2 className="text-[11px] tracking-widest uppercase text-muted border-b border-subtle pb-2">
            Members
          </h2>
          {!club.is_member && (
            <p className="text-sm text-muted py-4 text-center">Join to see the member list.</p>
          )}
          {club.is_member && (
            <div>
              {(membersData?.items ?? []).map(member => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  clubId={id}
                  isAdmin={!!club.is_admin}
                  onRemoved={() => {}}
                />
              ))}
              {membersData?.items.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No members yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Leagues */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-subtle pb-2">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">
            Leagues
          </h2>
          {club.is_admin && (
            <button
              onClick={() => setShowCreateLeague(!showCreateLeague)}
              className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              <Plus size={12} />
              New League
            </button>
          )}
        </div>

        {showCreateLeague && (
          <form
            onSubmit={e => { e.preventDefault(); createLeagueMutation.mutate() }}
            className="p-4 rounded border border-subtle bg-card space-y-3"
          >
            <input
              type="text"
              placeholder="League name"
              value={newLeagueName}
              onChange={e => setNewLeagueName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-subtle rounded text-secondary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]"
              required
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newLeagueDesc}
              onChange={e => setNewLeagueDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-subtle rounded text-secondary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]"
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                <input
                  type="radio"
                  checked={newLeagueType === 'public'}
                  onChange={() => setNewLeagueType('public')}
                  className="accent-[var(--brass)]"
                />
                Public
              </label>
              <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                <input
                  type="radio"
                  checked={newLeagueType === 'private'}
                  onChange={() => setNewLeagueType('private')}
                  className="accent-[var(--brass)]"
                />
                Private
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateLeague(false)}
                className="px-3 py-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newLeagueName.trim() || createLeagueMutation.isPending}
                className="px-4 py-1.5 bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse text-[11px] tracking-widest uppercase rounded transition-opacity"
              >
                {createLeagueMutation.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {(leaguesData?.items ?? []).length === 0 && !showCreateLeague && (
          <p className="text-sm text-muted text-center py-4">
            No leagues yet.{club.is_admin ? ' Create one to get started.' : ''}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(leaguesData?.items ?? []).map((league: League) => (
            <Link
              key={league.id}
              to="/leagues/$id"
              params={{ id: league.id }}
              className="flex items-center gap-3 p-3 rounded border border-subtle bg-card hover:border-[var(--brass)]/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--brass)]/10 border border-[var(--brass)]/20 flex items-center justify-center shrink-0">
                <Trophy size={18} className="text-[var(--brass)]/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-secondary truncate">{league.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <span>{league.type}</span>
                  <span>&middot;</span>
                  <span>{league.member_count} member{league.member_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Club Feed */}
      {club.is_member && <ClubFeed clubId={id} />}
    </div>
  )
}

function ClubFeed({ clubId }: { clubId: string }) {
  const { data } = useQuery({
    queryKey: ['club', clubId, 'posts'],
    queryFn: () => postApi.listByClub(clubId),
  })

  const posts = data?.items ?? []

  return (
    <div className="space-y-3">
      <h2 className="text-[11px] tracking-widest uppercase text-muted border-b border-subtle pb-2">
        Feed
      </h2>
      <PostComposer clubId={clubId} queryKey={['club', clubId, 'posts']} />
      {posts.length === 0 && (
        <p className="text-sm text-muted text-center py-4">No posts yet — be the first.</p>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
