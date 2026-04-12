import { Link } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Target, Trophy, MessageSquare, Star, RefreshCw } from 'lucide-react'
import { activityApi, ActivityItem } from '../api/activity'

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
      case 'commented': return <MessageSquare size={14} className="text-muted" />
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

export default function Feed() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => activityApi.getFeed(20, pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    initialPageParam: undefined as string | undefined,
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-lg lg:max-w-2xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">Feed</h1>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded border border-subtle bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-[var(--error-text)] text-sm">Failed to load feed.</p>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <p className="text-secondary">Nothing here yet.</p>
          <p className="text-sm text-muted">Follow other shooters to see their activity here.</p>
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
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
