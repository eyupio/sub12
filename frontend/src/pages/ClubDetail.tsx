import { useRef, useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Copy, Check, Trash2, ImagePlus, Medal, Trophy, Plus, Settings, Shield, ShieldOff, LogOut, Lock } from 'lucide-react'
import { ApiError } from '../api/client'
import { clubsApi, type ClubStanding, type ClubMember } from '../api/clubs'
import { postApi } from '../api/posts'
import type { League } from '../api/leagues'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MembersOnlyBanner } from '../components/MembersOnlyBanner'
import { PostCard } from '../components/PostCard'
import { PostComposer } from '../components/PostComposer'

function PrivateClubSummary({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient()
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['club-summary', clubId],
    queryFn: () => clubsApi.summary(clubId),
    retry: false,
  })

  const joinMutation = useMutation({
    mutationFn: () => clubsApi.join(clubId, joinCode || undefined),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      toast(r.pending ? 'Join request submitted' : 'Joined club', 'success')
    },
    onError: (err) => setJoinError(err instanceof ApiError ? err.message : 'Failed to join club.'),
  })

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 max-w-md mx-auto">
        <div className="h-48 rounded border border-subtle bg-surface animate-pulse" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="p-4 lg:p-8 text-center text-muted text-sm">
        Club not found.
      </div>
    )
  }

  const needsCode = data.join_policy === 'invite_code'
  return (
    <div className="p-4 lg:p-8 max-w-md mx-auto space-y-4">
      <MembersOnlyBanner
        kind="club"
        name={data.name}
        description={data.description}
        memberCount={data.member_count}
        joinPolicy={data.join_policy}
        onJoinClick={needsCode ? undefined : () => joinMutation.mutate()}
      />
      {needsCode && (
        <div className="space-y-2">
          <label className="block text-[10px] tracking-widest uppercase text-muted">Invite code</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50"
          />
          <button
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending || !joinCode}
            className="w-full px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-40"
          >
            {joinMutation.isPending ? 'Joining…' : 'Join with code'}
          </button>
          {joinError && <p className="text-xs text-[var(--error-text)]">{joinError}</p>}
        </div>
      )}
      <Link to="/clubs" className="block text-center text-[11px] tracking-widest uppercase text-muted hover:text-secondary">&larr; Back to clubs</Link>
    </div>
  )
}

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

function MemberRow({ member, clubId, isAdmin, currentUserId, adminCount, onRemoved }: {
  member: ClubMember
  clubId: string
  isAdmin: boolean
  currentUserId: string
  adminCount: number
  onRemoved: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmRole, setConfirmRole] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () => clubsApi.removeMember(clubId, member.user_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      onRemoved()
    },
  })

  const roleMutation = useMutation({
    mutationFn: () => clubsApi.updateMember(clubId, member.user_id, { is_admin: !member.is_admin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId, 'members'] })
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      toast(member.is_admin ? 'Demoted from admin' : 'Promoted to admin', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to update role', 'error'),
  })

  const isSelf = member.user_id === currentUserId

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
      {isAdmin && !isSelf && (
        <button
          onClick={() => setConfirmRole(true)}
          disabled={roleMutation.isPending || (member.is_admin && adminCount <= 1)}
          className="text-muted hover:text-[var(--brass)] transition-colors disabled:opacity-30"
          title={member.is_admin ? 'Demote from admin' : 'Promote to admin'}
          aria-label={member.is_admin ? `Demote ${member.display_name} from admin` : `Promote ${member.display_name} to admin`}
        >
          {member.is_admin ? <ShieldOff size={14} /> : <Shield size={14} />}
        </button>
      )}
      {isAdmin && !member.is_admin && !isSelf && (
        <button
          onClick={() => setConfirmRemove(true)}
          disabled={removeMutation.isPending}
          className="text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50"
          title="Remove member"
          aria-label={`Remove ${member.display_name} from club`}
        >
          <Trash2 size={14} />
        </button>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${member.display_name}?`}
        message="This member will be removed from the club."
        confirmLabel="Remove"
        onConfirm={() => { setConfirmRemove(false); removeMutation.mutate() }}
        onCancel={() => setConfirmRemove(false)}
      />
      <ConfirmDialog
        open={confirmRole}
        title={member.is_admin ? `Demote ${member.display_name}?` : `Promote ${member.display_name}?`}
        message={member.is_admin
          ? 'This member will no longer be able to manage club settings and members.'
          : 'This member will be able to manage club settings and members.'}
        confirmLabel={member.is_admin ? 'Demote' : 'Promote'}
        onConfirm={() => { setConfirmRole(false); roleMutation.mutate() }}
        onCancel={() => setConfirmRole(false)}
      />
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
  const [confirmLeave, setConfirmLeave] = useState(false)

  const { data: club, isLoading, error: clubError } = useQuery({
    queryKey: ['club', id],
    queryFn: () => clubsApi.get(id),
    retry: false,
  })

  const isPrivateOrNotFound =
    clubError instanceof ApiError && clubError.status === 404

  const { data: standingsData, isLoading: standingsLoading, isError: standingsError, refetch: refetchStandings } = useQuery({
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
    enabled: !!id && !!club?.is_member,
  })

  const [showCreateLeague, setShowCreateLeague] = useState(false)
  const [newLeagueName, setNewLeagueName] = useState('')
  const [newLeagueDesc, setNewLeagueDesc] = useState('')
  const [newLeagueType, setNewLeagueType] = useState<'public' | 'private'>('private')

  const createLeagueMutation = useMutation({
    mutationFn: () => clubsApi.createLeague(id, { name: newLeagueName, description: newLeagueDesc || undefined, type: newLeagueType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', id, 'leagues'] })
      setShowCreateLeague(false)
      setNewLeagueName('')
      setNewLeagueDesc('')
      setNewLeagueType('public')
      toast('League created', 'success')
    },
  })

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const joinMutation = useMutation({
    mutationFn: () => clubsApi.join(id, joinCodeInput || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['club', id] })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      if (data.pending) {
        toast('Join request submitted — awaiting admin approval', 'success')
      } else {
        toast('Joined club', 'success')
      }
      setJoinCodeInput('')
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setJoinError(err.message || 'Failed to join club.')
      } else {
        setJoinError('Failed to join club.')
      }
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => clubsApi.uploadImage(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['club', id] }),
    onError: () => toast('Failed to upload image', 'error'),
  })

  const leaveMutation = useMutation({
    mutationFn: () => clubsApi.leave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      queryClient.invalidateQueries({ queryKey: ['club', id] })
      toast('Left club', 'success')
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to leave club', 'error'),
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
    if (isPrivateOrNotFound) {
      return <PrivateClubSummary clubId={id} />
    }
    return (
      <div className="p-4 lg:p-8 text-center text-muted text-sm">
        Club not found.
      </div>
    )
  }

  const needsJoinCode = !club.is_member && club.join_policy === 'invite_code'
  const joinLabel = club.join_policy === 'approval' ? 'Request' : 'Join'

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary truncate">
              {club.name}
            </h1>
            {club.type === 'private' && (
              <span
                className="flex items-center gap-1 text-[9px] tracking-widest uppercase border border-subtle text-muted px-1.5 py-0.5 rounded shrink-0"
                title="Private club — only members can see content"
              >
                <Lock size={10} />
                Private
              </span>
            )}
          </div>
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
              {needsJoinCode && (
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value)}
                  placeholder="Join code"
                  className="w-32 bg-surface border border-subtle rounded px-2 py-1 text-xs text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50"
                />
              )}
              <button
                onClick={() => { setJoinError(''); joinMutation.mutate() }}
                disabled={joinMutation.isPending || (needsJoinCode && !joinCodeInput.trim())}
                className="px-4 py-1.5 bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse text-[11px] tracking-widest uppercase rounded transition-opacity"
              >
                {joinMutation.isPending ? 'Joining…' : joinLabel}
              </button>
              {joinError && <p className="text-[10px] text-[var(--error-text)] text-right">{joinError}</p>}
              {club.join_policy === 'approval' && !joinError && (
                <p className="text-[10px] text-muted text-right">Admins approve requests</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {club.is_admin && (
              <Link
                to="/clubs/$id/settings"
                params={{ id }}
                className="text-muted hover:text-secondary transition-colors"
                title="Club settings"
              >
                <Settings size={16} />
              </Link>
            )}
            {club.is_member && !club.is_admin && (
              <button
                onClick={() => setConfirmLeave(true)}
                disabled={leaveMutation.isPending}
                className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted hover:text-red-400 transition-colors disabled:opacity-50"
                title="Leave club"
              >
                <LogOut size={12} />
                Leave
              </button>
            )}
          </div>
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
        <div className="space-y-1">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">
            Top Performers
          </h2>
          <div className="border border-subtle rounded bg-surface px-3 lg:px-4 mt-2">
            {standingsLoading ? (
              <div className="space-y-px py-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-surface-hover rounded animate-pulse" />
                ))}
              </div>
            ) : standingsError ? (
              <div className="py-3 space-y-2">
                <p className="text-[var(--error-text)] text-sm">Failed to load standings.</p>
                <button
                  onClick={() => refetchStandings()}
                  className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
                >
                  Retry
                </button>
              </div>
            ) : (
              <StandingsTable standings={standingsData?.items ?? []} />
            )}
          </div>
        </div>

        {/* Members */}
        <div className="space-y-1">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">
            Members
          </h2>
          {!club.is_member && (
            <p className="text-sm text-muted py-4 text-center">Join to see the member list.</p>
          )}
          {club.is_member && (membersData?.items ?? []).length > 0 && (
            <div className="border border-subtle rounded bg-surface px-3 lg:px-4 mt-2">
              {(membersData?.items ?? []).map(member => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  clubId={id}
                  isAdmin={!!club.is_admin}
                  currentUserId={user?.id ?? ''}
                  adminCount={(membersData?.items ?? []).filter(m => m.is_admin).length}
                  onRemoved={() => {}}
                />
              ))}
            </div>
          )}
          {club.is_member && (membersData?.items ?? []).length === 0 && (
            <p className="text-sm text-muted text-center py-4">No members yet.</p>
          )}
        </div>
      </div>

      {/* Leagues (members only) */}
      {club.is_member && <div className="space-y-1">
        <div className="flex items-center justify-between">
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

        {(leaguesData?.items ?? []).length > 0 && (
          <div className="border border-subtle rounded bg-surface p-3 lg:p-4 mt-2">
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
        )}
      </div>}

      {/* Club Feed */}
      {club.is_member && <ClubFeed clubId={id} />}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave club?"
        message="You will no longer be a member of this club. You can rejoin later."
        confirmLabel="Leave"
        onConfirm={() => { setConfirmLeave(false); leaveMutation.mutate() }}
        onCancel={() => setConfirmLeave(false)}
      />
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
