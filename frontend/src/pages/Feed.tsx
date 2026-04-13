import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  Target, Trophy, MessageSquare, Star, RefreshCw,
  Building2, TestTube2, PlayCircle, CalendarPlus, Award, Globe, UserCheck,
} from 'lucide-react'
import { activityApi, ActivityItem, FeedFilter } from '../api/activity'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'

const FILTER_TABS: { key: FeedFilter; label: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', icon: Globe },
  { key: 'for_you', label: 'For You', icon: UserCheck },
  { key: 'league', label: 'League', icon: Trophy },
  { key: 'club', label: 'Club', icon: Building2 },
]

function ActivityCard({ item }: { item: ActivityItem }) {
  const date = new Date(item.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
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
      case 'achievement_earned':
        return (
          <p className="text-sm text-secondary">
            <span className="font-medium text-primary">{item.display_name}</span>
            {' earned '}
            <span className="font-medium text-[var(--brass)]">{item.metadata?.achievement_name ?? 'an achievement'}</span>
          </p>
        )
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
      default: return null
    }
  }

  return (
    <div className="flex gap-3 p-3 lg:p-4 rounded border border-subtle bg-surface">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
        {item.avatar_url
          ? <img src={item.avatar_url} alt={item.display_name} className="w-full h-full object-cover" />
          : initials
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <TypeIcon />
          <span className="text-[10px] tracking-widest uppercase text-muted">{date}</span>
        </div>
        {renderContent()}
      </div>
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
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Feed</h1>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] tracking-widest uppercase whitespace-nowrap transition-colors border ${
              filter === key
                ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                : 'border-subtle text-muted hover:text-secondary hover:border-[var(--brass)]/20'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
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
        <p className="text-[var(--error-text)] text-sm">Failed to load feed.</p>
      )}

      {!isLoading && !needsEntity && items.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <p className="text-secondary">{empty.title}</p>
          <p className="text-sm text-muted">{empty.subtitle}</p>
        </div>
      )}

      {needsEntity && (
        <div className="text-center py-12 space-y-2">
          <p className="text-secondary">Select a {filter} above to view its feed.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 px-4 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={isFetchingNextPage ? 'animate-spin' : ''} />
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
