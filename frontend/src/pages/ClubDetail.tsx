import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Copy, Check, Trash2, ImagePlus, Trophy, Plus, Settings,
  Shield, ShieldOff, LogOut, Lock, Flag, Share2, Activity, Flame,
  UserPlus, CalendarClock, Eye, MapPin, Clock, Phone, Info, Target,
  Ruler, Building2,
} from 'lucide-react'
import { ApiError } from '../api/client'
import { clubsApi, DAY_LABELS, type Club, type ClubMember, type ClubOpeningHours } from '../api/clubs'
import { eventsApi, type EventState } from '../api/events'
import { postApi } from '../api/posts'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImageEditor } from '../components/ImageEditor'
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
  LoadingRows,
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
  const [editingFile, setEditingFile] = useState<File | null>(null)

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

  // Approval-gated clubs used to leave admins to discover requests by chance —
  // surface the queue on the club page itself.
  const { data: pendingRequests } = useQuery({
    queryKey: ['club', id, 'join-requests', 'pending'],
    queryFn: () => clubsApi.listJoinRequests(id, 'pending'),
    enabled: !!club?.is_admin && club?.join_policy === 'approval',
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

  async function copyJoinCode() {
    if (!club) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(club.join_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy code — select and copy it manually', 'error')
    }
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
  const placeLabel = [club.city, club.region].filter(Boolean).join(', ')
  const pendingCount = pendingRequests?.items?.length ?? 0

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
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setEditingFile(f) }} />
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
            {club.league_count > 0 && (<>
              <span className="lc-detail-sub-sep">·</span>
              <span><Trophy size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {club.league_count} league{club.league_count !== 1 ? 's' : ''}</span>
            </>)}
            {placeLabel && (<>
              <span className="lc-detail-sub-sep">·</span>
              <span><MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {placeLabel}</span>
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

      {pendingCount > 0 && (
        <Link
          to="/clubs/$id/settings"
          params={{ id }}
          className="lc-section u-nudge"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 14, color: 'var(--ink)' }}
        >
          <UserPlus size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ flex: 1, fontSize: 13 }}>
            {pendingCount} join request{pendingCount !== 1 ? 's' : ''} waiting for review
          </span>
          <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>Review</span>
        </Link>
      )}

      {/* Code copy for members (admins included) */}
      {club.is_member && club.join_code && (
        <button
          onClick={copyJoinCode}
          style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: 0, marginBottom: 14 }}
        >
          {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
          {copied ? 'Copied!' : `Code: ${club.join_code}`}
        </button>
      )}

      <div className="lc-stack-lg">
        <ClubAbout club={club} />

        {/* Two-column: Top performers + Members */}
        <div className="lc-grid-2">
          <Section title="Top Performers" icon={<Trophy size={12} />}>
            {standingsLoading ? (
              <LoadingRows rows={5} />
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

        {/* Events (members only) */}
        {club.is_member && <ClubEvents clubId={id} isAdmin={!!club.is_admin} />}

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
          targetSlug={club.slug}
          targetType="club"
          targetLabel={club.name}
          shareTitle={club.name}
          shareText={`${club.name} on sub-12 — ${club.member_count} member${club.member_count === 1 ? '' : 's'}`}
          onClose={() => setShowShare(false)}
        />
      )}

      {editingFile && (
        <ImageEditor
          file={editingFile}
          onSave={(f) => { setEditingFile(null); uploadMutation.mutate(f) }}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </PageGrid>
  )
}

/** Renders a labelled row inside the About panel, skipping empty values. */
function AboutRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{children}</div>
      </div>
    </div>
  )
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item) => (
        <span
          key={item}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--lc-surface)', color: 'var(--ink-2)' }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

/** Formats one published slot, e.g. "10:00 – 15:00" or "Closed". */
function formatSlot(slot: ClubOpeningHours) {
  if (slot.is_closed) return 'Closed'
  if (!slot.opens_at || !slot.closes_at) return '—'
  return `${slot.opens_at} – ${slot.closes_at}`
}

function OpeningHoursTable({ hours }: { hours: ClubOpeningHours[] }) {
  const byDay = DAY_LABELS.map((label, day) => ({ label, slots: hours.filter((h) => h.day_of_week === day) }))
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {byDay.filter((d) => d.slots.length > 0).map((d) => (
        <div key={d.label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <span style={{ width: 88, flexShrink: 0, color: 'var(--muted)' }}>{d.label}</span>
          <span style={{ minWidth: 0 }}>
            {d.slots.map((slot, i) => (
              <span key={slot.id} style={{ display: 'block' }}>
                <span className="u-tnum">{formatSlot(slot)}</span>
                {slot.note && <span style={{ color: 'var(--muted)' }}> · {slot.note}</span>}
                {i < d.slots.length - 1 ? '' : ''}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The public face of a club: where it is, how to reach it, what you can shoot
 * there and when. Visible to non-members too — it's what someone browsing the
 * directory needs before deciding to join.
 */
function ClubAbout({ club }: { club: Club }) {
  const { data: hoursData } = useQuery({
    queryKey: ['club', club.id, 'opening-hours'],
    queryFn: () => clubsApi.getOpeningHours(club.id),
    retry: false,
  })
  const hours = hoursData?.items ?? []

  const addressLines = [club.address_line1, club.address_line2, club.city, club.region, club.postcode, club.country].filter(Boolean) as string[]
  const hasContact = !!(club.website_url || club.contact_email || club.contact_phone)
  const hasGear = club.disciplines.length > 0 || club.distances.length > 0 || club.facilities.length > 0
  const hasProfile = addressLines.length > 0 || hasContact || hasGear || hours.length > 0 ||
    !!club.membership_info || !!club.visitor_policy || club.established_year != null

  if (!hasProfile) {
    if (!club.is_admin) return null
    return (
      <Section title="About" icon={<Info size={12} />}>
        <EmptyState
          icon={<MapPin size={36} />}
          title="No club details yet"
          body="Add your location, contact details, disciplines and opening times so shooters can find you."
          cta={<Link to="/clubs/$id/settings" params={{ id: club.id }} className="lc-action-ghost"><Settings size={12} /> Add details</Link>}
        />
      </Section>
    )
  }

  const mapHref = club.latitude != null && club.longitude != null
    ? `https://www.openstreetmap.org/?mlat=${club.latitude}&mlon=${club.longitude}#map=15/${club.latitude}/${club.longitude}`
    : null

  return (
    <Section title="About" icon={<Info size={12} />}>
      {addressLines.length > 0 && (
        <AboutRow icon={<MapPin size={13} />} label="Where">
          {addressLines.join('\n')}
          {mapHref && (
            <div style={{ marginTop: 6 }}>
              <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', fontSize: 12 }}>View on map ↗</a>
            </div>
          )}
        </AboutRow>
      )}

      {hours.length > 0 && (
        <AboutRow icon={<Clock size={13} />} label="Opening times">
          <OpeningHoursTable hours={hours} />
        </AboutRow>
      )}

      {club.disciplines.length > 0 && (
        <AboutRow icon={<Target size={13} />} label="Disciplines"><ChipList items={club.disciplines} /></AboutRow>
      )}
      {club.distances.length > 0 && (
        <AboutRow icon={<Ruler size={13} />} label="Distances"><ChipList items={club.distances} /></AboutRow>
      )}
      {club.facilities.length > 0 && (
        <AboutRow icon={<Building2 size={13} />} label="Facilities"><ChipList items={club.facilities} /></AboutRow>
      )}

      {club.membership_info && (
        <AboutRow icon={<UserPlus size={13} />} label="Membership">{club.membership_info}</AboutRow>
      )}
      {club.visitor_policy && (
        <AboutRow icon={<Eye size={13} />} label="Visitors &amp; guests">{club.visitor_policy}</AboutRow>
      )}

      {hasContact && (
        <AboutRow icon={<Phone size={13} />} label="Contact">
          <div style={{ display: 'grid', gap: 4 }}>
            {club.website_url && (
              <a href={club.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>{club.website_url}</a>
            )}
            {club.contact_email && <a href={`mailto:${club.contact_email}`} style={{ color: 'var(--gold)' }}>{club.contact_email}</a>}
            {club.contact_phone && <a href={`tel:${club.contact_phone.replace(/\s+/g, '')}`} style={{ color: 'var(--gold)' }}>{club.contact_phone}</a>}
          </div>
        </AboutRow>
      )}

      {club.established_year != null && (
        <AboutRow icon={<CalendarClock size={13} />} label="Established">
          <span className="u-tnum">{club.established_year}</span>
        </AboutRow>
      )}
    </Section>
  )
}

function eventStateBadge(state: EventState) {
  switch (state) {
    case 'live':
      return <Badge variant="red" live>Live</Badge>
    case 'open_for_entries':
      return <Badge variant="green">Open</Badge>
    case 'complete':
      return <Badge variant="gold">Complete</Badge>
    case 'archived':
      return <Badge variant="neutral">Archived</Badge>
    case 'draft':
    default:
      return <Badge variant="neutral">Draft</Badge>
  }
}

function ClubEvents({ clubId, isAdmin }: { clubId: string; isAdmin: boolean }) {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['club', clubId, 'events'],
    queryFn: () => eventsApi.list({ clubId }),
  })
  const events = data?.items ?? []

  return (
    <Section
      title="Events"
      icon={<CalendarClock size={12} />}
      actions={
        isAdmin ? (
          <button
            className="lc-action-ghost"
            onClick={() => navigate({ to: '/events/new', search: { clubId } })}
          >
            <Plus size={12} /> New Event
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 64,
                borderRadius: 'var(--radius)',
                background: 'var(--lc-surface)',
                border: '1px solid var(--line)',
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      ) : error ? (
        <p style={{ padding: 18, color: 'var(--red)', fontSize: 13 }}>Failed to load events.</p>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={36} />}
          title="No events yet"
          body={isAdmin ? 'Run your first event for the club.' : 'Check back later.'}
          cta={
            isAdmin ? (
              <button
                className="lc-action-ghost"
                onClick={() => navigate({ to: '/events/new', search: { clubId } })}
              >
                <Plus size={12} /> New Event
              </button>
            ) : null
          }
        />
      ) : (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((ev) => {
            const badges = (
              <>
                {eventStateBadge(ev.state)}
                {ev.visibility === 'club_only' && (
                  <Badge variant="neutral">
                    <Lock size={10} /> Club only
                  </Badge>
                )}
                {ev.visibility === 'unlisted' && (
                  <Badge variant="neutral">
                    <Eye size={10} /> Unlisted
                  </Badge>
                )}
              </>
            )
            return (
              <EntityCard
                key={ev.id}
                to="/events/$slug"
                toParams={{ slug: ev.slug }}
                thumbIcon={<CalendarClock size={20} />}
                name={ev.name}
                badges={badges}
                meta={[
                  { icon: <Trophy size={11} />, text: ev.discipline },
                  { icon: <Users size={11} />, text: `${ev.participant_count} participant${ev.participant_count === 1 ? '' : 's'}` },
                ]}
                rightRail="chevron"
                size="small"
              />
            )
          })}
        </div>
      )}
    </Section>
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
