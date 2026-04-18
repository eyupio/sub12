import { useEffect, useState } from 'react'
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Users, Trophy, Settings, Copy, Check, PenLine, CheckCircle, XCircle, AlertCircle, Lock, LogOut } from 'lucide-react'
import { leagueApi, LeagueStanding, LeagueScore } from '../api/leagues'
import { ApiError } from '../api/client'
import { postApi } from '../api/posts'
import { useAuthStore } from '../store/auth'
import { PostCard } from '../components/PostCard'
import { PostComposer } from '../components/PostComposer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../store/toast'
import { useSmartBack } from '../hooks/useSmartBack'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[var(--brass)] font-mono text-sm font-semibold">1st</span>
  if (rank === 2) return <span className="text-secondary font-mono text-sm font-semibold">2nd</span>
  if (rank === 3) return <span className="text-amber-700 dark:text-amber-600 font-mono text-sm font-semibold">3rd</span>
  return <span className="font-mono text-sm text-muted">{rank}th</span>
}

function VerificationDot({ status }: { status: string }) {
  if (status === 'verified') return <span title="Verified by league admin"><CheckCircle size={14} className="text-[var(--success-text)] shrink-0" /></span>
  if (status === 'rejected') return <span title="Rejected by league admin"><XCircle size={14} className="text-[var(--error-text)] shrink-0" /></span>
  return <span title="Pending review by league admin"><AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" /></span>
}

function LeagueScoreRow({ score }: { score: LeagueScore }) {
  return (
    <Link
      to="/scores/$id"
      params={{ id: score.id }}
      className="flex items-center justify-between py-3 border-b border-subtle last:border-0"
    >
      <div className="min-w-0">
        <p className="text-sm text-secondary truncate">{score.display_name}</p>
        <p className="text-[11px] text-muted font-mono">{score.shot_at}</p>
      </div>
      <div className="flex items-center gap-3 font-mono shrink-0">
        <VerificationDot status={score.verification} />
        <span className="text-lg font-semibold text-primary">{score.total_score}</span>
        {score.x_count > 0 && (
          <span className="text-sm text-[var(--brass)]">{score.x_count}X</span>
        )}
      </div>
    </Link>
  )
}

function StandingRow({ standing }: { standing: LeagueStanding }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-subtle last:border-0">
      <div className="w-10 text-center">
        <RankBadge rank={standing.rank} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-secondary truncate">{standing.display_name}</p>
        <p className="text-[11px] text-muted">
          {standing.card_count} card{standing.card_count !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="text-right font-mono shrink-0">
        {standing.best_score != null ? (
          <>
            <span className="text-lg font-semibold text-primary">
              {typeof standing.best_score === 'number' && !Number.isInteger(standing.best_score)
                ? standing.best_score.toFixed(1)
                : standing.best_score}
            </span>
            {standing.best_x != null && standing.best_x > 0 && (
              <span className="text-xs text-[var(--brass)] ml-1.5">{standing.best_x}X</span>
            )}
          </>
        ) : (
          <span className="text-muted text-sm">—</span>
        )}
      </div>
    </div>
  )
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
  const [scoreFilter, setScoreFilter] = useState<string>('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    setJoinCode(initialJoinCode)
  }, [initialJoinCode])

  const { data: league, isLoading: leagueLoading, error: leagueError } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid'],
    queryFn: () => leagueApi.get(leagueId!),
    enabled: !!leagueId,
    retry: false,
  })

  const isLeaguePrivate = leagueError instanceof ApiError && leagueError.status === 404

  // When the league detail is denied, fall back to the public summary so the
  // UI can render a members-only banner with join CTA instead of a 404.
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

  const { data: standings, isLoading: standingsLoading, isError, error: standingsError, refetch: refetchStandings } = useQuery({
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

  // Pending scores count for admin badge
  const { data: pendingData } = useQuery({
    queryKey: ['leagues', leagueId ?? 'invalid', 'scores', 'pending'],
    queryFn: () => leagueApi.listScores(leagueId!, 100, 0, 'pending'),
    enabled: !!leagueId && !!members?.items?.find(m => m.user_id === currentUser?.id)?.is_admin,
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
      if (data.pending) {
        setJoinPending(true)
      } else {
        setJoinSuccess(true)
      }
      setJoinError('')
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'standings'] })
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      }
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setJoinError('You\'re already a member of this league.')
      } else if (err instanceof ApiError && err.status === 403) {
        setJoinError('Invalid or missing invite code.')
      } else {
        setJoinError('Failed to join. Please try again.')
      }
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
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'members'] })
      }
      navigate({ to: '/leagues' })
    },
    onError: (err: Error) => {
      setConfirmLeave(false)
      if (err instanceof ApiError && err.status === 409) {
        toast('You are the last admin — promote another member before leaving.', 'error')
      } else {
        toast('Failed to leave league', 'error')
      }
    },
  })

  const canLeave = isMember && (!isAdmin || adminCount > 1)

  const joinPolicy = config?.join_policy ?? 'open'
  const scoringRule = config?.scoring_rule ?? 'highest'

  if (!leagueId) {
    return (
      <div className="p-4 lg:p-8 max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/leagues" className="text-muted hover:text-secondary transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-lg font-medium tracking-widest uppercase text-secondary">Invalid League Link</h1>
        </div>
        <p className="text-sm text-muted">
          This invite link is malformed. Open the league again from the app or ask for a fresh invite link.
        </p>
      </div>
    )
  }

  if (isLeaguePrivate) {
    return (
      <div className="p-4 lg:p-8 max-w-md mx-auto text-center space-y-3">
        <Lock className="mx-auto text-muted" size={32} />
        <h1 className="text-lg tracking-widest uppercase text-secondary">
          {leagueSummary?.name ?? 'Private League'}
        </h1>
        {leagueSummary?.description && (
          <p className="text-sm text-muted">{leagueSummary.description}</p>
        )}
        <p className="text-xs text-muted">
          {leagueSummary
            ? `This league is private — members only. ${leagueSummary.member_count} member${leagueSummary.member_count === 1 ? '' : 's'}.`
            : 'This league is private or no longer exists. Ask an admin for an invite.'}
        </p>
        {leagueSummary && leagueId && (
          <div className="pt-1 space-y-2 max-w-xs mx-auto">
            {leagueSummary.join_policy === 'invite_code' && (
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="INVITE CODE"
                className="w-full bg-surface border border-subtle rounded px-2 py-1.5 text-sm text-secondary text-center font-mono tracking-widest focus:outline-none focus:border-[var(--brass)]/50"
              />
            )}
            {currentUser && (
              <button
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending || (leagueSummary.join_policy === 'invite_code' && !joinCode)}
                className="w-full px-3 py-1.5 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-40"
              >
                {leagueSummary.join_policy === 'approval' ? 'Request to join' : 'Join league'}
              </button>
            )}
          </div>
        )}
        <Link
          to="/leagues"
          className="inline-block text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
        >
          &larr; Back to leagues
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-4xl xl:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={smartBack}
          aria-label="Back"
          className="text-muted hover:text-secondary transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        {league?.image_url && (
          <img
            src={league.image_url}
            alt={league.name}
            className="w-10 h-10 rounded-lg object-cover border border-subtle shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {leagueLoading ? (
            <div className="h-5 w-40 bg-surface rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg lg:text-xl font-medium tracking-widest uppercase text-secondary truncate">
                  {league?.name ?? 'League'}
                </h1>
                <HelpIcon content={pageHelp.leagueDetail} />
              </div>
              {league?.description && (
                <p className="text-xs text-muted truncate mt-0.5">{league.description}</p>
              )}
            </>
          )}
        </div>
        {canLeave && (
          <button
            onClick={() => setConfirmLeave(true)}
            className="text-muted hover:text-[var(--error-text)] transition-colors"
            title="Leave league"
            aria-label="Leave league"
          >
            <LogOut size={18} />
          </button>
        )}
        {isAdmin && (
            <Link
              to="/leagues/$id/settings"
            params={{ id: leagueId }}
            className="text-muted hover:text-[var(--brass)] transition-colors"
            title="League Settings"
          >
            <Settings size={18} />
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave league?"
        message={
          isAdmin
            ? 'You will lose admin access and will need to rejoin (and be re-promoted) to return.'
            : 'You will need to rejoin to submit scores or see members-only posts.'
        }
        confirmLabel="Leave"
        onConfirm={() => leaveMutation.mutate()}
        onCancel={() => setConfirmLeave(false)}
      />

      {/* Join action */}
      {!isMember && !joinSuccess && !joinPending && (
        <div className="border border-subtle rounded p-3 lg:p-4 bg-surface space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted text-xs tracking-widest uppercase">
              <Users size={14} />
              {joinPolicy === 'open' && 'Public league'}
              {joinPolicy === 'invite_code' && 'Invite code required'}
              {joinPolicy === 'approval' && 'Admin approval required'}
            </div>
            {joinPolicy === 'open' && (
              <button
                onClick={() => { setJoinError(''); joinMutation.mutate() }}
                disabled={joinMutation.isPending}
                className="text-[11px] tracking-widest uppercase bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium px-4 py-1.5 rounded transition-opacity"
              >
                {joinMutation.isPending ? 'Joining...' : 'Join'}
              </button>
            )}
            {joinPolicy === 'approval' && (
              <button
                onClick={() => { setJoinError(''); joinMutation.mutate() }}
                disabled={joinMutation.isPending}
                className="text-[11px] tracking-widest uppercase bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium px-4 py-1.5 rounded transition-opacity"
              >
                {joinMutation.isPending ? 'Requesting...' : 'Request to Join'}
              </button>
            )}
          </div>

          {joinPolicy === 'invite_code' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="Enter invite code"
                className="flex-1 bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors font-mono"
              />
              <button
                onClick={() => { setJoinError(''); joinMutation.mutate() }}
                disabled={joinMutation.isPending || !joinCode.trim()}
                className="text-[11px] tracking-widest uppercase bg-[var(--brass)] hover:opacity-90 disabled:opacity-50 text-inverse font-medium px-4 py-1.5 rounded transition-opacity"
              >
                {joinMutation.isPending ? 'Joining...' : 'Join'}
              </button>
            </div>
          )}
        </div>
      )}

      {joinSuccess && (
        <div className="flex items-center gap-2 border border-[var(--success-border)] rounded p-3 lg:p-4 bg-[var(--success-bg)] text-[var(--success-text)] text-xs tracking-widest uppercase">
          <Trophy size={14} />
          You've joined this league
        </div>
      )}

      {joinPending && (
        <div className="flex items-center gap-2 border border-amber-500/20 rounded p-3 lg:p-4 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs tracking-widest uppercase">
          <Users size={14} />
          Your request is pending admin approval
        </div>
      )}

      {joinError && (
        <p className="text-amber-600 dark:text-amber-400 text-xs">{joinError}</p>
      )}

      {/* Join code — shown to members when league has an invite code */}
      {isMember && league?.join_code && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(league.join_code!)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
          title="Copy join code"
          aria-label="Copy join code"
        >
          {copied ? <Check size={12} className="text-[var(--success-text)]" /> : <Copy size={12} />}
          {copied ? 'Copied!' : `Code: ${league.join_code}`}
        </button>
      )}

      {/* Submit Score — shown to members */}
      {(isMember || joinSuccess) && (
        <Link
          to="/scores/new"
          search={{ leagueId, roundId: undefined }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded font-medium tracking-widest uppercase text-sm transition-colors bg-[var(--brass)] text-inverse hover:opacity-90"
        >
          <PenLine size={16} />
          Submit Score
        </Link>
      )}

      {/* Standings */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Standings</h2>
          <span className="text-[11px] tracking-widest uppercase text-muted">
            {scoringRule === 'average' ? 'Avg score' : 'Best score'}
          </span>
        </div>

        {isLoading && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface rounded animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="pt-2 space-y-2">
            <p className="text-[var(--error-text)] text-sm">
              {standingsError instanceof Error && standingsError.message.includes('401')
                ? 'Session expired. Please log in again.'
                : 'Failed to load standings.'}
            </p>
            <button
              onClick={() => refetchStandings()}
              className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
            >
              Retry
            </button>
          </div>
        )}

        {standings && standings.items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted text-sm tracking-widest uppercase">No members yet</p>
          </div>
        )}

        {standings && standings.items.length > 0 && (
          <div className="border border-subtle rounded bg-surface px-3 lg:px-4 mt-2">
            {standings.items.map(standing => (
              <StandingRow key={standing.user_id} standing={standing} />
            ))}
          </div>
        )}
      </div>

      {/* Admin: Pending Review */}
      {isAdmin && pendingData && pendingData.items.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] tracking-widest uppercase text-muted">Review Scores</h2>
            <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded">
              {pendingData.items.length}
            </span>
          </div>
          <div className="border border-amber-500/20 rounded bg-amber-500/5 px-3 lg:px-4 mt-2">
            {pendingData.items.map(score => (
              <LeagueScoreRow key={score.id} score={score} />
            ))}
          </div>
        </div>
      )}

      {isAdmin && pendingData && pendingData.items.length === 0 && (
        <div className="flex items-center gap-2 border border-[var(--success-border)] rounded p-3 bg-[var(--success-bg)] text-[var(--success-text)] text-xs tracking-widest uppercase">
          <CheckCircle size={14} />
          All scores reviewed
        </div>
      )}

      {/* Submitted Scores */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] tracking-widest uppercase text-muted">Submitted Scores</h2>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 pt-1">
          {[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'verified', label: 'Verified' },
            { value: 'rejected', label: 'Rejected' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setScoreFilter(tab.value)}
              className={[
                'text-[10px] tracking-widest uppercase px-2.5 py-1 rounded transition-colors',
                scoreFilter === tab.value
                  ? 'bg-[var(--brass)]/15 text-[var(--brass)] font-medium'
                  : 'text-muted hover:text-secondary',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {scoresLoading && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface rounded animate-pulse" />
            ))}
          </div>
        )}

        {scoresData && scoresData.items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted text-sm tracking-widest uppercase">
              {scoreFilter ? `No ${scoreFilter} scores` : 'No scores submitted yet'}
            </p>
          </div>
        )}

        {scoresData && scoresData.items.length > 0 && (
          <div className="border border-subtle rounded bg-surface px-3 lg:px-4 mt-2">
            {scoresData.items.map(score => (
              <LeagueScoreRow key={score.id} score={score} />
            ))}
          </div>
        )}
      </div>

      {/* League Feed */}
      {isMember && league && (
        <LeagueFeed leagueId={league.id} postVisibility={league.post_visibility} />
      )}
    </div>
  )
}

function LeagueFeed({
  leagueId,
  postVisibility,
}: {
  leagueId: string
  postVisibility: 'members' | 'public'
}) {
  const { data } = useQuery({
    queryKey: ['league', leagueId, 'posts'],
    queryFn: () => postApi.listByLeague(leagueId),
  })

  const posts = data?.items ?? []

  return (
    <div className="space-y-3">
      <h2 className="text-[11px] tracking-widest uppercase text-muted border-b border-subtle pb-2">
        Feed
      </h2>
      <PostComposer
        leagueId={leagueId}
        queryKey={['league', leagueId, 'posts']}
        groupPostVisibility={postVisibility}
      />
      {posts.length === 0 && (
        <p className="text-sm text-muted text-center py-4">No posts yet — be the first.</p>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
