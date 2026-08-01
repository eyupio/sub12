import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Trophy, Settings, Copy, Check, PenLine, CheckCircle, AlertCircle,
  Lock, LogOut, Share2, Flame, Trophy as TrophyIcon, Activity,
  ListChecks, Inbox,
} from 'lucide-react'
import { leagueApi, type LeagueScore } from '../api/leagues'
import { ApiError } from '../api/client'
import { postApi } from '../api/posts'
import { useAuthStore } from '../store/auth'
import { PostCard } from '../components/PostCard'
import { PostComposer } from '../components/PostComposer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ShareDialog } from '../components/ShareDialog'
import { toast } from '../store/toast'
import { useSmartBack } from '../hooks/useSmartBack'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import {
  PageGrid,
  EntityDetailHeader,
  DisciplineThumb,
  Section,
  Tabs,
  Badge,
  EmptyState,
  LoadingRows,
  Avatar,
  LeagueTable,
  rankColumn,
  shooterColumn,
  cardsColumn,
  bestColumn,
  avgColumn,
  recentColumn,
  trendColumn,
  type StandingRow,
  type TabSpec,
} from '../components/leagues'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseLeagueRouteId(rawId: string): { leagueId: string | null; inviteCode: string } {
  const [candidateId, rawQuery = ''] = rawId.split('?', 2)
  const leagueId = uuidPattern.test(candidateId) ? candidateId : null
  const inviteCode = new URLSearchParams(rawQuery).get('code')?.trim() ?? ''
  return { leagueId, inviteCode }
}

function normalizeInviteCode(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

type StandingsTab = 'table' | 'form' | 'history'
type ScoreTab = '' | 'pending' | 'verified' | 'rejected'

function statusBadge(verification: string) {
  if (verification === 'verified') return <Badge variant="green">Verified</Badge>
  if (verification === 'rejected') return <Badge variant="red">Rejected</Badge>
  return <Badge variant="gold">Pending</Badge>
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

export default function LeagueDetail() {
  const { id: rawId } = useParams({ from: '/app/leagues/$id' })
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const { leagueId, inviteCode } = parseLeagueRouteId(rawId)
  const initialJoinCode = normalizeInviteCode(search?.code) || inviteCode
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const smartBack = useSmartBack('/leagues', ['/clubs/', '/feed', '/profile', '/leagues'])
  const currentUser = useAuthStore(s => s.user)
  const [joinError, setJoinError] = useState('')
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [joinPending, setJoinPending] = useState(false)
  const [joinCode, setJoinCode] = useState(initialJoinCode)
  const [copied, setCopied] = useState(false)
  const [scoreFilter, setScoreFilter] = useState<ScoreTab>('')
  const [standingsTab, setStandingsTab] = useState<StandingsTab>('table')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => { setJoinCode(initialJoinCode) }, [initialJoinCode])

  const { data: league, isLoading: leagueLoading, error: leagueError } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid'],
    queryFn: () => leagueApi.get(leagueId!),
    enabled: !!leagueId,
    retry: false,
  })

  const isLeaguePrivate = leagueError instanceof ApiError && leagueError.status === 404
  const { data: leagueSummary } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'summary'],
    queryFn: () => leagueApi.summary(leagueId!),
    enabled: !!leagueId && isLeaguePrivate,
    retry: false,
  })

  const { data: config } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'config'],
    queryFn: () => leagueApi.getConfig(leagueId!),
    enabled: !!leagueId,
  })

  const { data: members } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'members'],
    queryFn: () => leagueApi.listMembers(leagueId!),
    enabled: !!currentUser && !!leagueId,
  })

  const { data: standings, isLoading: standingsLoading, isError } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'standings'],
    queryFn: () => leagueApi.standings(leagueId!),
    retry: 2,
    enabled: !!leagueId,
  })

  const { data: scoresData, isLoading: scoresLoading } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'scores', scoreFilter],
    queryFn: () => leagueApi.listScores(leagueId!, 50, 0, scoreFilter || undefined),
    enabled: !!leagueId,
  })

  // Recent cards drive the per-shooter sparkline in the "Form" tab. The tab
  // counters come from the counts endpoint below, so this stays a single page.
  const { data: recentScoresData } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'scores', 'recent'],
    queryFn: () => leagueApi.listScores(leagueId!, 100, 0),
    enabled: !!leagueId,
  })

  const { data: scoreCounts } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'score-counts'],
    queryFn: () => leagueApi.scoreCounts(leagueId!),
    enabled: !!leagueId,
  })

  const isLoading = leagueLoading || standingsLoading
  const currentMember = currentUser && members ? members.items.find(m => m.user_id === currentUser.id) : null
  const isAdmin = currentMember?.is_admin ?? false
  const isMember = !!currentMember

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error('Invalid league link.')
      return leagueApi.join(leagueId, joinCode || undefined)
    },
    onSuccess: (data) => {
      if (data.pending) setJoinPending(true)
      else setJoinSuccess(true)
      setJoinError('')
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'standings'] })
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      }
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) setJoinError("You're already a member of this league.")
      else if (err instanceof ApiError && err.status === 403) setJoinError('Invalid or missing invite code.')
      else setJoinError('Failed to join. Please try again.')
    },
  })

  const adminCount = members?.items.filter(m => m.is_admin).length ?? 0

  const leaveMutation = useMutation({
    mutationFn: () => leagueApi.leave(leagueId!),
    onSuccess: () => {
      setConfirmLeave(false)
      toast('Left league', 'success')
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'leagues'] })
      if (leagueId) queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      navigate({ to: '/leagues' })
    },
    onError: (err: Error) => {
      setConfirmLeave(false)
      if (err instanceof ApiError && err.status === 409) toast('You are the last admin — promote another member before leaving.', 'error')
      else toast('Failed to leave league', 'error')
    },
  })

  const canLeave = isMember && (!isAdmin || adminCount > 1)
  const joinPolicy = config?.join_policy ?? 'open'
  const scoringRule = config?.scoring_rule ?? 'highest'

  // Build standings rows. best_score from the API is the *ranking* score, so
  // under the "average" rule it is the shooter's mean — not their best card.
  // It is surfaced under whichever header matches the league's rule rather
  // than being shown twice under two different labels.
  const standingsRows: StandingRow[] = useMemo(() => {
    const items = standings?.items ?? []
    const scoreMap = new Map<string, number[]>()
    for (const s of recentScoresData?.items ?? []) {
      if (s.verification !== 'verified') continue
      if (!scoreMap.has(s.user_id)) scoreMap.set(s.user_id, [])
      scoreMap.get(s.user_id)!.push(s.total_score)
    }
    const isAverage = scoringRule === 'average'
    return items.map((s) => ({
      id: s.user_id,
      rank: s.rank,
      name: s.display_name,
      avatarUrl: s.avatar_url,
      cards: s.card_count,
      best: isAverage ? null : (s.best_score ?? null),
      bestX: s.best_x ?? null,
      avg: isAverage ? (s.best_score ?? null) : null,
      recent: (scoreMap.get(s.user_id) ?? []).slice(0, 6).reverse(),
      trend: null,
      isMe: s.user_id === currentUser?.id,
    }))
  }, [standings, recentScoresData, currentUser, scoringRule])

  const podium = standingsRows.slice(0, 3)

  const visibility: 'public' | 'private' = league?.type === 'private' ? 'private' : 'public'
  // A club league's code is inert — joining is gated on club membership — so
  // showing one would just be a control that does nothing.
  const code = league?.club_id ? undefined : league?.join_code

  // Which round a new card lands in. Members only: the call creates the
  // default round on first use, so it must not fire for onlookers.
  const { data: activeRound } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'ensure-round'],
    queryFn: () => leagueApi.ensureDefaultRound(leagueId!),
    enabled: !!leagueId && isMember,
  })

  async function copyCode() {
    if (!code) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy code — select and copy it manually', 'error')
    }
  }

  if (!leagueId) {
    return (
      <PageGrid>
        <EntityDetailHeader
          onBack={() => navigate({ to: '/leagues' })}
          thumb={<DisciplineThumb size={48} icon={<Trophy size={20} />} />}
          title="Invalid League Link"
        />
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          This invite link is malformed. Open the league again from the app or ask for a fresh invite link.
        </p>
      </PageGrid>
    )
  }

  if (isLeaguePrivate) {
    return (
      <PageGrid>
        <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
          <Lock size={32} style={{ color: 'var(--muted)' }} />
          <h1 className="t-page-title" style={{ marginTop: 12 }}>
            {leagueSummary?.name ?? 'Private League'}
          </h1>
          {leagueSummary?.description && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>{leagueSummary.description}</p>}
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
            {leagueSummary
              ? `This league is private — members only. ${leagueSummary.member_count} member${leagueSummary.member_count === 1 ? '' : 's'}.`
              : 'This league is private or no longer exists. Ask an admin for an invite.'}
          </p>
          {leagueSummary && leagueId && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
              {leagueSummary.join_policy === 'invite_code' && (
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="INVITE CODE"
                  className="font-mono"
                  style={{ background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 6, color: 'var(--ink)', textAlign: 'center', letterSpacing: '0.16em' }}
                />
              )}
              {currentUser && (
                <button
                  className="lc-cta"
                  onClick={() => joinMutation.mutate()}
                  disabled={joinMutation.isPending || (leagueSummary.join_policy === 'invite_code' && !joinCode)}
                >
                  {leagueSummary.join_policy === 'approval' ? 'Request to join' : 'Join league'}
                </button>
              )}
            </div>
          )}
          <Link to="/leagues" style={{ display: 'inline-block', marginTop: 18, color: 'var(--gold)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>← Back to leagues</Link>
        </div>
      </PageGrid>
    )
  }

  const totalCards = scoreCounts?.all ?? 0

  const scoreTabs: TabSpec<ScoreTab>[] = [
    { value: '', label: 'All', count: scoreCounts?.all ?? null },
    { value: 'pending', label: 'Pending', count: scoreCounts?.pending ?? null },
    { value: 'verified', label: 'Verified', count: scoreCounts?.verified ?? null },
    { value: 'rejected', label: 'Rejected', count: scoreCounts?.rejected ?? null },
  ]

  const standingsTabs: TabSpec<StandingsTab>[] = [
    { value: 'table', label: 'Table', count: standingsRows.length },
    { value: 'form', label: 'Form' },
    { value: 'history', label: 'History' },
  ]

  return (
    <PageGrid>
      <EntityDetailHeader
        onBack={smartBack}
        thumb={
          league?.image_url ? (
            <img src={league.image_url} alt={league.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
          ) : (
            <DisciplineThumb size={48} icon={<Trophy size={20} />} />
          )
        }
        title={leagueLoading ? '…' : (league?.name ?? 'League')}
        tag={
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {visibility === 'private' && <Badge variant="neutral"><Lock size={10} /> Private</Badge>}
            <HelpIcon content={pageHelp.leagueDetail} />
          </span>
        }
        sub={
          <>
            {league?.description && <span>{league.description}</span>}
            {league?.description && <span className="lc-detail-sub-sep">·</span>}
            <span><Users size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {league?.member_count ?? 0} shooters</span>
            {code && (<>
              <span className="lc-detail-sub-sep">·</span>
              <span className="font-mono"><Lock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {code}</span>
            </>)}
          </>
        }
        rightActions={
          <>
            <button className="lc-icon-btn" onClick={() => setShowShare(true)} aria-label="Share"><Share2 size={14} /></button>
            {canLeave && (
              <button className="lc-icon-btn" onClick={() => setConfirmLeave(true)} aria-label="Leave"><LogOut size={14} /></button>
            )}
            {isAdmin && leagueId && (
              <Link to="/leagues/$id/settings" params={{ id: leagueId }} className="lc-icon-btn" aria-label="Settings">
                <Settings size={14} />
              </Link>
            )}
          </>
        }
      />

      {showShare && league && leagueId && (
        <ShareDialog
          targetId={leagueId}
          targetType="league"
          targetLabel={league.name}
          shareTitle={league.name}
          shareText={`Join ${league.name} on sub-12 — ${league.member_count} member${league.member_count === 1 ? '' : 's'}`}
          onClose={() => setShowShare(false)}
        />
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave league?"
        message={isAdmin ? 'You will lose admin access and will need to rejoin (and be re-promoted) to return.' : 'You will need to rejoin to submit scores or see members-only posts.'}
        confirmLabel="Leave"
        onConfirm={() => leaveMutation.mutate()}
        onCancel={() => setConfirmLeave(false)}
      />

      <div className="lc-stack-lg">
        {/* Submit Score CTA */}
        {(isMember || joinSuccess) && (
          <div>
            <Link to="/scores/new" search={{ leagueId, roundId: undefined }} className="lc-cta" style={{ textDecoration: 'none' }}>
              <PenLine size={16} /> Submit Score
            </Link>
            {activeRound && (
              <p style={{ marginTop: 6, textAlign: 'center', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Submitting to {activeRound.season_name} · {activeRound.round_name}
              </p>
            )}
          </div>
        )}

        {/* Join action */}
        {!isMember && !joinSuccess && !joinPending && (
          <div className="lc-section" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                <Users size={14} />
                {joinPolicy === 'open' && 'Public league'}
                {joinPolicy === 'invite_code' && 'Invite code required'}
                {joinPolicy === 'approval' && 'Admin approval required'}
              </div>
              {(joinPolicy === 'open' || joinPolicy === 'approval') && (
                <button onClick={() => { setJoinError(''); joinMutation.mutate() }} disabled={joinMutation.isPending} className="lc-action-ghost" style={{ background: 'var(--gold)', color: 'white' }}>
                  {joinMutation.isPending ? 'Joining…' : (joinPolicy === 'approval' ? 'Request to Join' : 'Join')}
                </button>
              )}
            </div>
            {joinPolicy === 'invite_code' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="Enter invite code"
                  className="font-mono"
                  style={{ flex: 1, background: 'var(--lc-surface)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 6, color: 'var(--ink)' }}
                />
                <button onClick={() => { setJoinError(''); joinMutation.mutate() }} disabled={joinMutation.isPending || !joinCode.trim()} className="lc-action-ghost" style={{ background: 'var(--gold)', color: 'white' }}>
                  {joinMutation.isPending ? 'Joining…' : 'Join'}
                </button>
              </div>
            )}
          </div>
        )}

        {joinSuccess && (
          <div className="lc-status-row"><Trophy size={14} /> You've joined this league</div>
        )}
        {joinPending && (
          <div className="lc-status-row warn"><Users size={14} /> Your request is pending admin approval</div>
        )}
        {joinError && <p style={{ color: 'var(--red)', fontSize: 12 }}>{joinError}</p>}

        {/* Code copy */}
        {isMember && code && (
          <button
            onClick={copyCode}
            style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: 0 }}
          >
            {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
            {copied ? 'Copied!' : `Code: ${code}`}
          </button>
        )}

        {/* Status row — admins only; jumps straight to the pending queue */}
        {isAdmin && scoreCounts && scoreCounts.pending === 0 && (
          <div className="lc-status-row"><CheckCircle size={14} /> All scores reviewed</div>
        )}
        {isAdmin && scoreCounts && scoreCounts.pending > 0 && (
          <button
            type="button"
            onClick={() => setScoreFilter('pending')}
            className="lc-status-row warn"
            style={{ width: '100%', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
          >
            <AlertCircle size={14} /> {scoreCounts.pending} score{scoreCounts.pending !== 1 ? 's' : ''} pending review — review now
          </button>
        )}

        {/* Standings — full width */}
        <Section
          title="Standings"
          icon={<TrophyIcon size={12} />}
          tabs={<Tabs<StandingsTab> tabs={standingsTabs} active={standingsTab} onChange={setStandingsTab} />}
        >
          {isLoading && (
            <LoadingRows rows={6} />
          )}
          {isError && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--red)' }}>Failed to load standings.</div>
          )}
          {standings && standingsRows.length === 0 && (
            <EmptyState
              icon={<TrophyIcon size={42} />}
              title="No cards yet"
              body="Be the first to submit a score and claim the top spot."
            />
          )}
          {standings && standingsRows.length > 0 && (
            <LeagueTable<StandingRow>
              rows={standingsRows}
              columns={[
                rankColumn(),
                shooterColumn(),
                cardsColumn(),
                ...(scoringRule === 'average' ? [avgColumn<StandingRow>()] : [bestColumn<StandingRow>()]),
                ...(standingsTab === 'form' ? [recentColumn<StandingRow>()] : []),
                trendColumn(),
              ]}
              initialSortKey="rank"
              initialSortDir="asc"
            />
          )}
        </Section>

        {/* Two-column row */}
        <div className="lc-grid-2">
          <Section title="Podium" icon={<TrophyIcon size={12} />}>
            {podium.length === 0 ? (
              <EmptyState icon={<TrophyIcon size={36} />} title="No podium yet" body="Submit cards to populate the podium." />
            ) : (
              <div className="lc-podium-list">
                {podium.map((p) => (
                  <div className="lc-podium-row" key={p.id}>
                    <div className="lc-podium-rank-tile">{p.rank}</div>
                    <Avatar name={p.name} size="md" src={p.avatarUrl} />
                    <div>
                      <div className="lc-podium-name">{p.name}</div>
                      <div className="lc-podium-meta">
                        {p.best ?? '—'}
                        {p.bestX != null && <span style={{ marginLeft: 6, color: 'var(--gold)' }}>· {p.bestX}X</span>}
                      </div>
                    </div>
                    {p.rank === 1 && <Flame size={14} className="lc-podium-flame" />}
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="League Info" icon={<Activity size={12} />}>
            <div className="lc-kv">
              <div className="lc-kv-row">
                <span className="lc-kv-key">Visibility</span>
                <span className="lc-kv-val serif">
                  <span className={`lc-vdot ${visibility === 'private' ? 'lc-vdot-private' : 'lc-vdot-public'}`} />
                  {visibility}
                </span>
              </div>
              <div className="lc-kv-row">
                <span className="lc-kv-key">Cards submitted</span>
                <span className="lc-kv-val">{totalCards}</span>
              </div>
              <div className="lc-kv-row">
                <span className="lc-kv-key">Scoring</span>
                <span className="lc-kv-val serif">{scoringRule === 'average' ? 'Average' : 'Best'}</span>
              </div>
              {code && (
                <div className="lc-kv-row">
                  <span className="lc-kv-key">Code</span>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="lc-kv-val"
                    style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', font: 'inherit' }}
                    title="Click to copy"
                  >
                    {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
                    {copied ? 'Copied!' : code}
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Submitted Scores */}
        <Section
          title="Submitted Scores"
          icon={<ListChecks size={12} />}
          tabs={<Tabs<ScoreTab> tabs={scoreTabs} active={scoreFilter} onChange={setScoreFilter} />}
        >
          {scoresLoading && (
            <LoadingRows rows={5} />
          )}
          {scoresData && scoresData.items.length === 0 && (
            <EmptyState
              icon={<Inbox size={42} />}
              title={scoreFilter ? `No ${scoreFilter} scores` : 'No scores submitted yet'}
            />
          )}
          {scoresData && scoresData.items.length > 0 && (
            <div className="lc-list">
              {scoresData.items.map((s) => <ScoreRow key={s.id} score={s} />)}
            </div>
          )}
          {scoresData && scoresData.items.length >= 50 && (
            <p style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Showing the latest 50 scores.
            </p>
          )}
        </Section>

        {/* Feed */}
        {isMember && league && (
          <LeagueFeed leagueId={league.id} postVisibility={league.post_visibility} />
        )}
      </div>
    </PageGrid>
  )
}

function ScoreRow({ score }: { score: LeagueScore }) {
  return (
    <Link to="/scores/$id" params={{ id: score.id }} className="lc-score-row" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Avatar name={score.display_name} size="md" src={score.avatar_url} />
      <div style={{ minWidth: 0 }}>
        <div className="lc-score-name">{score.display_name}</div>
        <div className="lc-score-date">{formatDate(score.shot_at)}</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {statusBadge(score.verification)}
        <div style={{ textAlign: 'right' }}>
          <span className="lc-score-val">{score.total_score}</span>
          {score.x_count > 0 && <span className="lc-score-x">{score.x_count}X</span>}
        </div>
      </div>
    </Link>
  )
}

function LeagueFeed({ leagueId, postVisibility }: { leagueId: string; postVisibility: 'members' | 'public' }) {
  const { data } = useQuery({
    queryKey: ['league', leagueId, 'posts'],
    queryFn: () => postApi.listByLeague(leagueId),
  })
  const posts = data?.items ?? []
  return (
    <Section title="Feed" icon={<Activity size={12} />}>
      <div style={{ padding: 16 }}>
        <PostComposer
          leagueId={leagueId}
          queryKey={['league', leagueId, 'posts']}
          groupPostVisibility={postVisibility}
        />
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
