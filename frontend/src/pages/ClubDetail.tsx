import { useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Copy, Check, Trash2, ImagePlus, Trophy, Plus, Settings,
  Shield, ShieldOff, LogOut, Lock, Flag, Share2, Activity, Flame,
  UserPlus,
} from 'lucide-react'
import { ApiError } from '../api/client'
import { clubsApi, type ClubMember } from '../api/clubs'
import { postApi } from '../api/posts'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MembersOnlyBanner } from '../components/MembersOnlyBanner'
import { PostCard } from '../components/PostCard'
import { PostComposer } from '../components/PostComposer'
import { ShareDialog } from '../components/ShareDialog'
import {
  PageGrid,
  EntityDetailHeader,
  DisciplineThumb,
  Section,
  Badge,
  EmptyState,
  Avatar,
  EntityCard,
  LeagueTable,
  rankColumn,
  shooterColumn,
  bestColumn,
  cardsColumn,
  xColumn,
  type StandingRow,
} from '../components/leagues'

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

  if (isLoading) return <PageGrid><div style={{ height: 200, background: 'var(--lc-surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }} /></PageGrid>
  if (!data) return <PageGrid><p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>Club not found.</p></PageGrid>

  const needsCode = data.join_policy === 'invite_code'
  return (
    <PageGrid>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <MembersOnlyBanner
          kind="club"
          name={data.name}
          description={data.description}
          memberCount={data.member_count}
          joinPolicy={data.join_policy}
          onJoinClick={needsCode ? undefined : () => joinMutation.mutate()}
        />
        {needsCode && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              className="font-mono"
              style={{ width: '100%', background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: 6, color: 'var(--ink)' }}
            />
            <button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending || !joinCode}
              className="lc-cta"
            >
              {joinMutation.isPending ? 'Joining…' : 'Join with code'}
            </button>
            {joinError && <p style={{ fontSize: 12, color: 'var(--red)' }}>{joinError}</p>}
          </div>
        )}
        <Link to="/clubs" style={{ display: 'block', textAlign: 'center', marginTop: 18, color: 'var(--gold)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>← Back to clubs</Link>
      </div>
    </PageGrid>
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
    <div className="lc-member-row">
      <Avatar name={member.display_name} src={member.avatar_url} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lc-member-name">{member.display_name}</div>
        <div className="lc-member-joined">Joined {member.joined_at.slice(0, 10)}</div>
      </div>
      {member.is_admin && <Badge variant="gold">Admin</Badge>}
      {isAdmin && !isSelf && (
        <button
          onClick={() => setConfirmRole(true)}
          disabled={roleMutation.isPending || (member.is_admin && adminCount <= 1)}
          className="lc-icon-btn"
          style={{ width: 28, height: 28 }}
          title={member.is_admin ? 'Demote' : 'Promote'}
        >
          {member.is_admin ? <ShieldOff size={12} /> : <Shield size={12} />}
        </button>
      )}
      {isAdmin && !member.is_admin && !isSelf && (
        <button
          onClick={() => setConfirmRemove(true)}
          disabled={removeMutation.isPending}
          className="lc-icon-btn"
          style={{ width: 28, height: 28 }}
          title="Remove member"
        >
          <Trash2 size={12} />
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
        message={member.is_admin ? 'This member will no longer manage settings.' : 'This member will be able to manage settings.'}
        confirmLabel={member.is_admin ? 'Demote' : 'Promote'}
        onConfirm={() => { setConfirmRole(false); roleMutation.mutate() }}
        onCancel={() => setConfirmRole(false)}
      />
    </div>
  )
}

export default function ClubDetail() {
  const { id } = useParams({ from: '/app/clubs/$id' })
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showShare, setShowShare] = useState(false)

  const { data: club, isLoading, error: clubError } = useQuery({
    queryKey: ['club', id],
    queryFn: () => clubsApi.get(id),
    retry: false,
  })

  const isPrivateOrNotFound = clubError instanceof ApiError && clubError.status === 404

  const { data: standingsData, isLoading: standingsLoading } = useQuery({
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
      toast(data.pending ? 'Join request submitted — awaiting admin approval' : 'Joined club', 'success')
      setJoinCodeInput('')
    },
    onError: (err) => setJoinError(err instanceof ApiError ? (err.message || 'Failed to join club.') : 'Failed to join club.'),
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

  const standingsRows: StandingRow[] = useMemo(() => {
    return (standingsData?.items ?? []).map((s) => ({
      id: s.user_id,
      rank: s.rank,
      name: s.display_name,
      avatarUrl: s.avatar_url,
      cards: s.card_count,
      best: s.best_score ?? null,
      bestX: s.best_x ?? null,
      isMe: s.user_id === user?.id,
    }))
  }, [standingsData, user])

  if (isLoading) {
    return (
      <PageGrid>
        <div style={{ height: 96, background: 'var(--lc-surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
        <div style={{ height: 200, background: 'var(--lc-surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }} />
      </PageGrid>
    )
  }

  if (!club) {
    if (isPrivateOrNotFound) return <PrivateClubSummary clubId={id} />
    return <PageGrid><p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>Club not found.</p></PageGrid>
  }

  const needsJoinCode = !club.is_member && club.join_policy === 'invite_code'
  const joinLabel = club.join_policy === 'approval' ? 'Request' : 'Join'
  const adminCount = (membersData?.items ?? []).filter(m => m.is_admin).length

  return (
    <PageGrid>
      <EntityDetailHeader
        onBack={() => navigate({ to: '/clubs' })}
        thumb={
          <div style={{ position: 'relative' }}>
            {club.image_url ? (
              <img src={club.image_url} alt={club.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
            ) : (
              <DisciplineThumb size={48} icon={<Users size={20} />} />
            )}
            {club.is_admin && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%', background: 'var(--lc-surface)', border: '1px solid var(--line)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Upload club image"
                >
                  <ImagePlus size={11} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = '' }} />
              </>
            )}
          </div>
        }
        title={club.name}
        tag={club.type === 'private' ? <Badge variant="neutral"><Lock size={10} /> Private</Badge> : null}
        sub={
          <>
            {club.description && <span>{club.description}</span>}
            {club.description && <span className="lc-detail-sub-sep">·</span>}
            <span><Users size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {club.member_count} member{club.member_count !== 1 ? 's' : ''}</span>
            {club.league_count != null && (<>
              <span className="lc-detail-sub-sep">·</span>
              <span><Trophy size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {club.league_count} league{club.league_count !== 1 ? 's' : ''}</span>
            </>)}
          </>
        }
        rightActions={
          <>
            <button className="lc-icon-btn" onClick={() => setShowShare(true)} aria-label="Share"><Share2 size={14} /></button>
            {club.is_admin && (
              <Link to="/clubs/$id/reports" params={{ id }} className="lc-icon-btn" aria-label="Reports"><Flag size={14} /></Link>
            )}
            {club.is_admin && (
              <Link to="/clubs/$id/settings" params={{ id }} className="lc-icon-btn" aria-label="Settings"><Settings size={14} /></Link>
            )}
            {club.is_member && !club.is_admin && (
              <button className="lc-icon-btn" onClick={() => setConfirmLeave(true)} aria-label="Leave"><LogOut size={14} /></button>
            )}
          </>
        }
      />

      {/* Join row for non-members */}
      {!club.is_member && user && (
        <div className="lc-section" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, color: 'var(--muted)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {club.join_policy === 'open' && 'Open club'}
              {club.join_policy === 'invite_code' && 'Invite code required'}
              {club.join_policy === 'approval' && 'Admins approve requests'}
            </div>
            {needsJoinCode && (
              <input
                type="text"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value)}
                placeholder="Join code"
                className="font-mono"
                style={{ width: 140, background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '6px 10px', borderRadius: 6, color: 'var(--ink)', fontSize: 12 }}
              />
            )}
            <button
              onClick={() => { setJoinError(''); joinMutation.mutate() }}
              disabled={joinMutation.isPending || (needsJoinCode && !joinCodeInput.trim())}
              className="lc-action-ghost"
              style={{ background: 'var(--gold)', color: 'white' }}
            >
              {joinMutation.isPending ? 'Joining…' : joinLabel}
            </button>
          </div>
          {joinError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{joinError}</p>}
        </div>
      )}

      {/* Code copy for admin */}
      {club.is_admin && (
        <button
          onClick={copyJoinCode}
          style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: 0, marginBottom: 14 }}
        >
          {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
          {copied ? 'Copied!' : `Code: ${club.join_code}`}
        </button>
      )}

      <div className="lc-stack-lg">
        {/* Two-column: Top performers + Members */}
        <div className="lc-grid-2">
          <Section title="Top Performers" icon={<Trophy size={12} />}>
            {standingsLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
            ) : standingsRows.length === 0 ? (
              <EmptyState icon={<Trophy size={36} />} title="No scores yet" body="Members need verified score cards to appear here." />
            ) : (
              <LeagueTable<StandingRow>
                rows={standingsRows}
                columns={[
                  rankColumn(),
                  shooterColumn(),
                  bestColumn(),
                  xColumn(),
                  cardsColumn(),
                ]}
                initialSortKey="rank"
              />
            )}
            {standingsRows.length > 0 && standingsRows[0] && (
              <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11 }}>
                <Flame size={12} style={{ color: 'var(--gold)' }} /> {standingsRows[0].name} leads
              </div>
            )}
          </Section>
          <Section
            title={`Members ${club.member_count}`}
            icon={<Users size={12} />}
            actions={club.is_admin ? <button className="lc-action-ghost" onClick={copyJoinCode}><UserPlus size={12} /> Invite</button> : null}
          >
            {!club.is_member && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Join to see the member list.
              </div>
            )}
            {club.is_member && (membersData?.items ?? []).length > 0 && (
              <div className="lc-members-scroll">
                {(membersData?.items ?? []).map(m => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    clubId={id}
                    isAdmin={!!club.is_admin}
                    currentUserId={user?.id ?? ''}
                    adminCount={adminCount}
                    onRemoved={() => {}}
                  />
                ))}
              </div>
            )}
            {club.is_member && (membersData?.items ?? []).length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No members yet.</div>
            )}
          </Section>
        </div>

        {/* Leagues (members only) */}
        {club.is_member && (
          <Section
            title="Leagues"
            icon={<Trophy size={12} />}
            actions={club.is_admin ? (
              <button className="lc-action-ghost" onClick={() => setShowCreateLeague((v) => !v)}>
                <Plus size={12} /> New League
              </button>
            ) : null}
          >
            {showCreateLeague && (
              <form
                onSubmit={(e) => { e.preventDefault(); createLeagueMutation.mutate() }}
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--line)' }}
              >
                <input type="text" placeholder="League name" value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} required autoFocus
                  style={{ background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 6, color: 'var(--ink)', fontSize: 13 }} />
                <input type="text" placeholder="Description (optional)" value={newLeagueDesc} onChange={(e) => setNewLeagueDesc(e.target.value)}
                  style={{ background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 6, color: 'var(--ink)', fontSize: 13 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--ink-2)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="radio" checked={newLeagueType === 'public'} onChange={() => setNewLeagueType('public')} /> Public
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="radio" checked={newLeagueType === 'private'} onChange={() => setNewLeagueType('private')} /> Private
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setShowCreateLeague(false)} className="lc-action-ghost" style={{ color: 'var(--muted)' }}>Cancel</button>
                  <button type="submit" disabled={!newLeagueName.trim() || createLeagueMutation.isPending} className="lc-action-ghost" style={{ background: 'var(--gold)', color: 'white' }}>
                    {createLeagueMutation.isPending ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            )}

            {(leaguesData?.items ?? []).length === 0 && !showCreateLeague && (
              <EmptyState
                icon={<Trophy size={36} />}
                title="No leagues yet"
                body={club.is_admin ? 'Create one to get started.' : 'Check back later.'}
                cta={club.is_admin ? <button className="lc-action-ghost" onClick={() => setShowCreateLeague(true)}><Plus size={12} /> New League</button> : null}
              />
            )}

            {(leaguesData?.items ?? []).length > 0 && (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(leaguesData?.items ?? []).map((league) => (
                  <EntityCard
                    key={league.id}
                    to="/leagues/$id"
                    toParams={{ id: league.id }}
                    thumbImage={league.image_url}
                    name={league.name}
                    badges={league.type === 'private' ? <Badge variant="neutral"><Lock size={10} /> Private</Badge> : null}
                    meta={[
                      { icon: <Users size={11} />, text: `${league.member_count} member${league.member_count !== 1 ? 's' : ''}` },
                    ]}
                    rightRail="chevron"
                    size="small"
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Feed */}
        {club.is_member && <ClubFeed clubId={id} postVisibility={club.post_visibility} />}
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave club?"
        message="You will no longer be a member of this club. You can rejoin later."
        confirmLabel="Leave"
        onConfirm={() => { setConfirmLeave(false); leaveMutation.mutate() }}
        onCancel={() => setConfirmLeave(false)}
      />

      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="club"
          targetLabel={club.name}
          shareTitle={club.name}
          shareText={`${club.name} on sub-12 — ${club.member_count} member${club.member_count === 1 ? '' : 's'}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </PageGrid>
  )
}

function ClubFeed({ clubId, postVisibility }: { clubId: string; postVisibility: 'members' | 'public' }) {
  const { data } = useQuery({
    queryKey: ['club', clubId, 'posts'],
    queryFn: () => postApi.listByClub(clubId),
  })
  const posts = data?.items ?? []
  return (
    <Section title="Feed" icon={<Activity size={12} />}>
      <div style={{ padding: 16 }}>
        <PostComposer clubId={clubId} queryKey={['club', clubId, 'posts']} groupPostVisibility={postVisibility} />
        {posts.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0', fontSize: 13 }}>No posts yet — be the first.</p>
        )}
        <div className="lc-stack" style={{ marginTop: 12 }}>
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      </div>
    </Section>
  )
}
