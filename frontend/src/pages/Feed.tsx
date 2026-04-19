import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Trophy, MessageSquare, Star, RefreshCw,
  Building2, TestTube2, PlayCircle, CalendarPlus, Award, Globe, UserCheck, Send,
  Lightbulb, CheckCircle, PenSquare, Share2, AlertTriangle,
} from 'lucide-react'
import { activityApi, ActivityItem, FeedFilter } from '../api/activity'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { scoreCardApi } from '../api/scoreCards'
import { useAuthStore } from '../store/auth'
import { iconForAchievement } from '../utils/achievementIcons'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { StarBadge } from '../components/StarBadge'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'
import { LikeButton } from '../components/LikeButton'
import { ReportDialog } from '../components/ReportDialog'

const FILTER_TABS: { key: FeedFilter; label: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', icon: Globe },
  { key: 'for_you', label: 'For You', icon: UserCheck },
  { key: 'league', label: 'League', icon: Trophy },
  { key: 'club', label: 'Club', icon: Building2 },
]

function getCardNavigator(
  item: ActivityItem,
  navigate: ReturnType<typeof useNavigate>,
): (() => void) | null {
  switch (item.type) {
    case 'score_posted':
    case 'personal_best':
    case 'commented': {
      const id = item.target_id
      return id ? () => navigate({ to: '/scores/$id', params: { id } }) : null
    }
    case 'pellet_test_posted': {
      const id = item.target_id
      return id ? () => navigate({ to: '/pellet-testing/$id', params: { id } }) : null
    }
    case 'joined_league': {
      const id = item.target_id ?? item.league_id
      return id ? () => navigate({ to: '/leagues/$id', params: { id } }) : null
    }
    case 'league_round_opened':
    case 'league_season_started': {
      const id = item.league_id
      return id ? () => navigate({ to: '/leagues/$id', params: { id } }) : null
    }
    case 'joined_club': {
      const id = item.target_id ?? item.club_id
      return id ? () => navigate({ to: '/clubs/$id', params: { id } }) : null
    }
    case 'feature_request_created':
    case 'feature_request_implemented': {
      const id = item.target_id
      return id ? () => navigate({ to: '/feature-requests/$id', params: { id } }) : null
    }
    case 'post_created': {
      const id = item.target_id
      return id ? () => navigate({ to: '/posts/$id', params: { id } }) : null
    }
    case 'achievement_earned': {
      const id = item.user_id
      return id ? () => navigate({ to: '/users/$id', params: { id } }) : null
    }
    default:
      return null
  }
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const prefs = useRegionalPrefs()
  const date = formatDate(item.created_at, prefs)
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [reportTargetId, setReportTargetId] = useState<string | null>(null)

  const goToCard = getCardNavigator(item, navigate)

  const shouldIgnoreCardClick = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    return !!target.closest('a, button, input, textarea, form, [data-no-card-nav]')
  }

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!goToCard) return
    if (e.defaultPrevented) return
    if (shouldIgnoreCardClick(e.target)) return
    goToCard()
  }

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!goToCard) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (shouldIgnoreCardClick(e.target)) return
    e.preventDefault()
    goToCard()
  }

  const isScoreCard = item.target_type === 'score_card' && !!item.target_id
  const canInteract = !!currentUser && isScoreCard

  const { data: commentsData } = useQuery({
    queryKey: ['score-cards', item.target_id, 'comments'],
    queryFn: () => scoreCardApi.listComments(item.target_id!),
    enabled: showComments && isScoreCard,
  })

  const commentMutation = useMutation({
    mutationFn: () => scoreCardApi.createComment(item.target_id!, newComment.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', item.target_id, 'comments'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setNewComment('')
    },
  })

  const initials = item.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  function renderContent() {
    switch (item.type) {
      case 'score_posted':
      case 'personal_best': {
        const score = item.metadata?.total_score
        const xCount = item.metadata?.x_count
        const isPB = item.type === 'personal_best' || item.metadata?.is_pb
        return (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm text-secondary">
                <span className="font-medium text-primary">{item.display_name}</span>
                {isPB ? ' set a personal best' : ' posted a score'}
              </p>
              {item.target_id && (
                <Link
                  to="/scores/$id"
                  params={{ id: item.target_id }}
                  className="text-[11px] text-muted hover:text-secondary transition-colors"
                >
                  View card →
                </Link>
              )}
            </div>
            {score != null && (
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-mono font-semibold text-[var(--brass)]">{score}</p>
                {xCount != null && xCount > 0 && (
                  <p className="text-[11px] text-muted">{xCount}X</p>
                )}
              </div>
            )}
          </div>
        )
      }
      case 'joined_league':
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span>
            {' joined '}
            {item.target_id ? (
              <Link
                to="/leagues/$id"
                params={{ id: item.target_id }}
                className="text-[var(--brass)] hover:underline"
              >
                {item.metadata?.league_name ?? 'a league'}
              </Link>
            ) : (
              <span>{item.metadata?.league_name ?? 'a league'}</span>
            )}
          </p>
        )
      case 'joined_club':
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span>
            {' joined '}
            {item.target_id ? (
              <Link
                to="/clubs/$id"
                params={{ id: item.target_id }}
                className="text-[var(--brass)] hover:underline"
              >
                {item.metadata?.club_name ?? 'a club'}
              </Link>
            ) : (
              <span>{item.metadata?.club_name ?? 'a club'}</span>
            )}
          </p>
        )
      case 'commented':
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span>
            {' commented on a score card'}
            {item.target_id && (
              <>
                {' — '}
                <Link
                  to="/scores/$id"
                  params={{ id: item.target_id }}
                  className="text-muted hover:text-secondary transition-colors"
                >
                  View →
                </Link>
              </>
            )}
          </p>
        )
      case 'pellet_test_posted': {
        const best = item.metadata?.best_group_mm
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span>
            {' posted a pellet test'}
            {best != null && <span className="text-muted"> — {best.toFixed(2)}mm best group</span>}
            {item.target_id && (
              <>
                {' '}
                <Link
                  to="/pellet-testing/$id"
                  params={{ id: item.target_id }}
                  className="text-[11px] text-muted hover:text-secondary transition-colors"
                >
                  View →
                </Link>
              </>
            )}
          </p>
        )
      }
      case 'league_round_opened':
        return (
          <p className="text-sm text-secondary">
            {'New round in '}
            {item.league_id ? (
              <Link
                to="/leagues/$id"
                params={{ id: item.league_id }}
                className="text-[var(--brass)] hover:underline"
              >
                {item.metadata?.league_name ?? 'a league'}
              </Link>
            ) : (
              <span>{item.metadata?.league_name ?? 'a league'}</span>
            )}
            {item.metadata?.round_name && (
              <span className="font-medium text-primary">: {item.metadata.round_name}</span>
            )}
          </p>
        )
      case 'league_season_started':
        return (
          <p className="text-sm text-secondary">
            {'New season in '}
            {item.league_id ? (
              <Link
                to="/leagues/$id"
                params={{ id: item.league_id }}
                className="text-[var(--brass)] hover:underline"
              >
                {item.metadata?.league_name ?? 'a league'}
              </Link>
            ) : (
              <span>{item.metadata?.league_name ?? 'a league'}</span>
            )}
            {item.metadata?.season_name && (
              <span className="font-medium text-primary">: {item.metadata.season_name}</span>
            )}
          </p>
        )
      case 'feature_request_created':
        return (
          <p className="text-sm text-secondary">
            {'New feature request: '}
            {item.target_id ? (
              <Link
                to="/feature-requests/$id"
                params={{ id: item.target_id }}
                className="text-[var(--brass)] hover:underline font-medium"
              >
                {item.metadata?.title ?? 'View details'}
              </Link>
            ) : (
              <span className="font-medium text-primary">{item.metadata?.title ?? 'a feature request'}</span>
            )}
            {item.metadata?.scope_type && <span className="text-muted"> · {item.metadata.scope_type}</span>}
          </p>
        )
      case 'feature_request_implemented':
        return (
          <p className="text-sm text-secondary">
            {'Feature implemented: '}
            {item.target_id ? (
              <Link
                to="/feature-requests/$id"
                params={{ id: item.target_id }}
                className="text-[var(--brass)] hover:underline font-medium"
              >
                {item.metadata?.title ?? 'View details'}
              </Link>
            ) : (
              <span className="font-medium text-primary">{item.metadata?.title ?? 'a feature'}</span>
            )}
          </p>
        )
      case 'post_created': {
        const body = item.metadata?.body_preview?.trim()
        const attType = item.metadata?.attachment_type
        const attId = item.metadata?.attachment_target_id
        const scopeName = item.metadata?.league_name ?? item.metadata?.club_name
        const scopeRoute: 'league' | 'club' | null =
          item.league_id ? 'league' : item.club_id ? 'club' : null
        const scopeId = item.league_id ?? item.club_id
        const isShare = attType === 'score_card' || attType === 'pellet_test'

        let action: string
        if (isShare && attType === 'score_card') action = ' shared a score card'
        else if (isShare && attType === 'pellet_test') action = ' shared a pellet test'
        else action = ' posted'

        return (
          <div className="space-y-1">
            <p className="text-sm text-secondary">
              <Link
                to="/users/$id"
                params={{ id: item.user_id }}
                className="font-medium text-primary hover:underline"
              >
                {item.display_name}
              </Link>
              {action}
              {scopeName && scopeRoute === 'league' && scopeId && (
                <>
                  {' in '}
                  <Link
                    to="/leagues/$id"
                    params={{ id: scopeId }}
                    className="text-[var(--brass)] hover:underline"
                  >
                    {scopeName}
                  </Link>
                </>
              )}
              {scopeName && scopeRoute === 'club' && scopeId && (
                <>
                  {' in '}
                  <Link
                    to="/clubs/$id"
                    params={{ id: scopeId }}
                    className="text-[var(--brass)] hover:underline"
                  >
                    {scopeName}
                  </Link>
                </>
              )}
            </p>
            {body && (
              <p className="text-xs text-muted line-clamp-2">“{body}”</p>
            )}
            {isShare && attId && attType === 'score_card' && (
              <Link
                to="/scores/$id"
                params={{ id: attId }}
                className="text-[11px] text-muted hover:text-secondary transition-colors"
              >
                View card →
              </Link>
            )}
            {isShare && attId && attType === 'pellet_test' && (
              <Link
                to="/pellet-testing/$id"
                params={{ id: attId }}
                className="text-[11px] text-muted hover:text-secondary transition-colors"
              >
                View test →
              </Link>
            )}
          </div>
        )
      }
      case 'achievement_earned': {
        const AchIcon = iconForAchievement(item.metadata?.achievement_icon)
        const achName = item.metadata?.achievement_name ?? 'an achievement'
        const achDesc = item.metadata?.achievement_description
        return (
          <div className="space-y-1">
            <p className="text-sm text-secondary">
              <Link
                to="/users/$id"
                params={{ id: item.user_id }}
                className="font-medium text-primary hover:underline"
              >
                {item.display_name}
              </Link>
              {' earned '}
              <span className="inline-flex items-center gap-1 font-medium text-[var(--brass)]">
                <AchIcon size={13} />
                {achName}
              </span>
            </p>
            {achDesc && (
              <p className="text-[11px] text-muted">{achDesc}</p>
            )}
          </div>
        )
      }
      default:
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span> did something
          </p>
        )
    }
  }

  function TypeIcon() {
    switch (item.type) {
      case 'personal_best': return <Star size={14} className="text-[var(--brass)]" />
      case 'score_posted': return <Target size={14} className="text-muted" />
      case 'joined_league': return <Trophy size={14} className="text-muted" />
      case 'joined_club': return <Building2 size={14} className="text-muted" />
      case 'commented': return <MessageSquare size={14} className="text-muted" />
      case 'pellet_test_posted': return <TestTube2 size={14} className="text-muted" />
      case 'league_round_opened': return <PlayCircle size={14} className="text-muted" />
      case 'league_season_started': return <CalendarPlus size={14} className="text-muted" />
      case 'achievement_earned': return <Award size={14} className="text-[var(--brass)]" />
      case 'feature_request_created': return <Lightbulb size={14} className="text-[var(--brass)]" />
      case 'feature_request_implemented': return <CheckCircle size={14} className="text-[var(--brass)]" />
      case 'post_created': {
        const attType = item.metadata?.attachment_type
        if (attType === 'score_card' || attType === 'pellet_test') {
          return <Share2 size={14} className="text-muted" />
        }
        return <PenSquare size={14} className="text-muted" />
      }
      default: return null
    }
  }

  const comments = commentsData?.items ?? []

  const cardClasses = goToCard
    ? 'flex gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface cursor-pointer hover:border-[var(--brass)]/30 transition-colors'
    : 'flex gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface'

  return (
    <div
      className={cardClasses}
      onClick={goToCard ? handleCardClick : undefined}
      onKeyDown={goToCard ? handleCardKeyDown : undefined}
      role={goToCard ? 'link' : undefined}
      tabIndex={goToCard ? 0 : undefined}
      aria-label={goToCard ? `${item.display_name} — ${item.type.replace(/_/g, ' ')}` : undefined}
    >
      {/* Avatar with star badge */}
      <div className="flex-shrink-0">
        <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
          {item.avatar_url
            ? <img src={item.avatar_url} alt={item.display_name} className="w-full h-full object-cover" />
            : initials
          }
        </div>
        {item.star_level > 0 && (
          <div className="flex justify-center mt-0.5">
            <StarBadge level={item.star_level} size={8} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <TypeIcon />
          <span className="text-[10px] tracking-widest uppercase text-muted">{date}</span>
        </div>
        {renderContent()}

        {/* Social actions — only for score card activity items */}
        {canInteract && (
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-subtle">
            <LikeButton
              targetId={item.target_id!}
              targetType="score_card"
              initialLiked={item.is_liked}
              initialCount={item.like_count}
              size={14}
            />
            <button
              onClick={() => setShowComments((v) => !v)}
              aria-label={`${showComments ? 'Hide' : 'View'} comments`}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-colors"
            >
              <MessageSquare size={14} />
              {item.comment_count > 0 && <span>{item.comment_count}</span>}
            </button>
          </div>
        )}

        {/* Inline comment section */}
        {showComments && isScoreCard && (
          <div className="mt-3 space-y-2" data-no-card-nav>
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-surface-hover border border-subtle flex-shrink-0 flex items-center justify-center text-[9px] font-medium text-muted overflow-hidden">
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt={c.display_name} className="w-full h-full object-cover" />
                    : c.display_name.slice(0, 2).toUpperCase()
                  }
                </div>
                <div className="flex-1 rounded bg-surface-hover px-2 py-1 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-primary">{c.display_name} </span>
                    <span className="text-xs text-secondary">{c.body}</span>
                  </div>
                  {currentUser && currentUser.id !== c.user_id && (
                    <button
                      onClick={() => setReportTargetId(c.id)}
                      className="p-0.5 text-muted hover:text-[var(--error-text)] transition-colors flex-shrink-0"
                      aria-label="Report comment"
                      title="Report inappropriate comment"
                    >
                      <AlertTriangle size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {currentUser && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newComment.trim()) commentMutation.mutate()
                }}
                className="flex gap-2 mt-2"
              >
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 rounded border border-subtle bg-surface px-2 py-1 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || commentMutation.isPending}
                  aria-label="Post comment"
                  className="p-1.5 rounded border border-subtle text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={12} />
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <ReportDialog
        open={reportTargetId !== null}
        targetType="comment"
        targetId={reportTargetId ?? ''}
        onClose={() => setReportTargetId(null)}
      />
    </div>
  )
}

function EntitySelector({
  filter,
  entityId,
  setEntityId,
}: {
  filter: FeedFilter
  entityId: string
  setEntityId: (id: string) => void
}) {
  const { data: leagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: filter === 'league',
  })

  const { data: clubs } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list(),
    enabled: filter === 'club',
  })

  if (filter === 'league') {
    const items = leagues?.items ?? []
    if (items.length === 0) {
      return <p className="text-xs text-muted">You haven't joined any leagues yet.</p>
    }
    return (
      <select
        value={entityId}
        onChange={(e) => setEntityId(e.target.value)}
        className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
      >
        <option value="">Select a league...</option>
        {items.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    )
  }

  if (filter === 'club') {
    const items = (clubs?.items ?? []).filter((c) => c.is_member)
    if (items.length === 0) {
      return <p className="text-xs text-muted">You haven't joined any clubs yet.</p>
    }
    return (
      <select
        value={entityId}
        onChange={(e) => setEntityId(e.target.value)}
        className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
      >
        <option value="">Select a club...</option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    )
  }

  return null
}

const EMPTY_MESSAGES: Record<FeedFilter, { title: string; subtitle: string }> = {
  public: { title: 'No public activity yet.', subtitle: 'Be the first to post a score.' },
  for_you: { title: 'Nothing here yet.', subtitle: 'Follow other shooters to see their activity here.' },
  league: { title: 'No activity in this league yet.', subtitle: 'Submit a score to get things started.' },
  club: { title: 'No activity in this club yet.', subtitle: 'Invite members to join.' },
}

export default function Feed() {
  const [filter, setFilter] = useState<FeedFilter>('for_you')
  const [entityId, setEntityId] = useState('')

  // Reset entity when switching filters
  const handleFilterChange = (f: FeedFilter) => {
    setFilter(f)
    setEntityId('')
  }

  const needsEntity = (filter === 'league' || filter === 'club') && !entityId

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['feed', filter, entityId],
    queryFn: ({ pageParam }) => activityApi.getFeed(20, pageParam as string | undefined, filter, entityId || undefined),
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !needsEntity,
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const empty = EMPTY_MESSAGES[filter]

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-lg lg:max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Feed</h1>
        <HelpIcon content={pageHelp.feed} />
      </div>

      {/* Filter tabs */}
      <div role="tablist" aria-label="Feed filter" className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_TABS.map(({ key, label, icon: Icon }) => {
          const selected = filter === key
          return (
            <button
              key={key}
              role="tab"
              aria-selected={selected}
              aria-controls="feed-panel"
              onClick={() => handleFilterChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] tracking-widest uppercase whitespace-nowrap transition-colors border ${
                selected
                  ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                  : 'border-subtle text-muted hover:text-secondary hover:border-[var(--brass)]/20'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          )
        })}
      </div>

      {/* Entity selector for league/club */}
      {(filter === 'league' || filter === 'club') && (
        <EntitySelector filter={filter} entityId={entityId} setEntityId={setEntityId} />
      )}

      {/* Feed content */}
      {isLoading && !needsEntity && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded border border-subtle bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="flex flex-col items-center gap-3 py-8">
          <p className="text-[var(--error-text)] text-sm">Failed to load feed.</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/30 transition-colors"
          >
            <RefreshCw size={12} />
            Try again
          </button>
        </div>
      )}

      {!isLoading && !needsEntity && items.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <p className="text-secondary">{empty.title}</p>
          <p className="text-sm text-muted">{empty.subtitle}</p>
          {filter === 'for_you' && (
            <Link
              to="/users"
              className="inline-block mt-2 px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/10 transition-colors"
            >
              Find people to follow
            </Link>
          )}
        </div>
      )}

      {needsEntity && (
        <div className="text-center py-12 space-y-2">
          <p className="text-secondary">Select a {filter} above to view its feed.</p>
        </div>
      )}

      <div id="feed-panel" role="tabpanel" className="space-y-3">
        {items.map((item) => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={isFetchingNextPage ? 'animate-spin' : ''} />
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
