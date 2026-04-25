import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign,
  Award,
  Bookmark,
  ChevronDown,
  CircleDot,
  Crosshair,
  Flame,
  Globe,
  Heart,
  Image,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Target,
  Trophy,
  User,
  Users,
  Zap,
} from 'lucide-react'
import { activityApi, type ActivityItem, type FeedFilter } from '../api/activity'
import { achievementApi } from '../api/achievements'
import { clubsApi } from '../api/clubs'
import { leagueApi } from '../api/leagues'
import { postApi } from '../api/posts'
import { scoreCardApi } from '../api/scoreCards'
import { UserAvatar } from '../components/UserAvatar'
import { LikeButton } from '../components/LikeButton'
import { iconForAchievement } from '../utils/achievementIcons'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { useThemeStore } from '../store/theme'
import {
  feedCounts,
  filterFeedPosts,
  normalizeActivity,
  sortFeedPosts,
  targetShots,
  type FeedDensity,
  type FeedPost,
  type FeedScope,
  type FeedSort,
} from './feedUtils'
import './feed.css'

type Destination =
  | { type: 'public'; id: ''; name: 'Public' }
  | { type: 'league'; id: string; name: string }
  | { type: 'club'; id: string; name: string }

const FILTERS: Array<{ key: FeedScope; label: string; icon: typeof Sparkles }> = [
  { key: 'for_you', label: 'For You', icon: Sparkles },
  { key: 'public', label: 'Public', icon: Globe },
  { key: 'leagues', label: 'Leagues', icon: Trophy },
  { key: 'clubs', label: 'Clubs', icon: Users },
  { key: 'following', label: 'Following', icon: User },
]

const STORAGE = {
  filter: 'sub12.feed.filter',
  sort: 'sub12.feed.sort',
  rail: 'sub12.feed.showRail',
  composer: 'sub12.feed.showComposer',
  milestones: 'sub12.feed.highlightMilestones',
  density: 'sub12.feed.density',
}

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored == null ? initial : JSON.parse(stored) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage is best-effort UI state.
    }
  }, [key, value])

  return [value, setValue] as const
}

function feedApiFilter(scope: FeedScope): FeedFilter {
  return scope === 'public' ? 'public' : 'for_you'
}

function relativeHandle(name: string): string {
  return `@${name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'shooter'}`
}

function countByName(posts: FeedPost[], type: 'league' | 'club') {
  const counts = new Map<string, number>()
  posts.forEach((post) => {
    if (post.whereType !== type || !post.where) return
    counts.set(post.where, (counts.get(post.where) ?? 0) + 1)
  })
  return counts
}

export default function Feed() {
  const currentUser = useAuthStore((s) => s.user)
  const [activeFilter, setActiveFilter] = useStoredState<FeedScope>(STORAGE.filter, 'for_you')
  const [sort, setSort] = useStoredState<FeedSort>(STORAGE.sort, 'latest')
  const [showRail, setShowRail] = useStoredState<boolean>(STORAGE.rail, true)
  const [showComposer, setShowComposer] = useStoredState<boolean>(STORAGE.composer, true)
  const [highlightMilestones, setHighlightMilestones] = useStoredState<boolean>(STORAGE.milestones, true)
  const [density, setDensity] = useStoredState<FeedDensity>(STORAGE.density, 'comfortable')
  const [expandedComments, setExpandedComments] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const queryFilter = feedApiFilter(activeFilter)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['feed', queryFilter],
    queryFn: ({ pageParam }) => activityApi.getFeed(30, pageParam as string | undefined, queryFilter),
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
    initialPageParam: undefined as string | undefined,
  })

  const allPosts = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []).map(normalizeActivity),
    [data],
  )
  const counts = useMemo(() => feedCounts(allPosts, currentUser?.id), [allPosts, currentUser?.id])
  const visiblePosts = useMemo(
    () => sortFeedPosts(filterFeedPosts(allPosts, activeFilter, currentUser?.id), sort),
    [activeFilter, allPosts, currentUser?.id, sort],
  )

  const focusComposer = () => {
    setShowComposer(true)
    window.setTimeout(() => composerRef.current?.focus(), 0)
  }

  return (
    <div className={`feed-shell ${density === 'compact' ? 'is-compact' : ''}`}>
      <div className={`feed-page ${showRail ? 'with-rail' : ''}`}>
        <main className="feed-main" aria-label="Social feed">
          <FeedHeader onNewPost={focusComposer} />
          <FilterBar
            active={activeFilter}
            counts={counts}
            sort={sort}
            onFilter={setActiveFilter}
            onSort={setSort}
          />
          <FeedTweaks
            showRail={showRail}
            showComposer={showComposer}
            highlightMilestones={highlightMilestones}
            density={density}
            onShowRail={setShowRail}
            onShowComposer={setShowComposer}
            onHighlightMilestones={setHighlightMilestones}
            onDensity={setDensity}
          />
          {showComposer && <FeedComposer ref={composerRef} />}

          {isLoading && <FeedSkeleton />}
          {isError && (
            <div className="feed-state" role="alert">
              <p>Failed to load feed.</p>
              <button className="feed-btn feed-btn-outline" onClick={() => refetch()}>
                <RefreshCw size={13} />
                Try again
              </button>
            </div>
          )}

          {!isLoading && !isError && visiblePosts.length === 0 && (
            <div className="feed-state">
              <Sparkles size={22} />
              <p>No activity in this slice yet.</p>
              {activeFilter === 'following' && (
                <Link to="/users" className="feed-btn feed-btn-outline">
                  Find shooters
                </Link>
              )}
            </div>
          )}

          <div className="feed-stream" id="feed-panel">
            {visiblePosts.map((post) => (
              <FeedPostArticle
                key={post.id}
                post={post}
                muted={!highlightMilestones && (post.kind === 'achievement' || post.kind === 'join')}
                commentsOpen={expandedComments === post.id}
                onToggleComments={() => setExpandedComments((open) => open === post.id ? null : post.id)}
              />
            ))}
          </div>

          {hasNextPage && (
            <div className="feed-load-more">
              <button
                type="button"
                className="feed-btn feed-btn-outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                <RefreshCw size={13} className={isFetchingNextPage ? 'feed-spin' : ''} />
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}

          {!hasNextPage && visiblePosts.length > 0 && <FeedEnd />}
        </main>

        {showRail && <FeedRail posts={allPosts} />}
      </div>
    </div>
  )
}

function FeedHeader({ onNewPost }: { onNewPost: () => void }) {
  return (
    <header className="feed-header">
      <div>
        <p className="feed-eyebrow">Social</p>
        <h1>Feed</h1>
      </div>
      <div className="feed-header-actions">
        <Link to="/notifications" className="feed-btn feed-btn-outline">
          <Zap size={13} />
          Notifications
        </Link>
        <button type="button" className="feed-btn feed-btn-gold" onClick={onNewPost}>
          + New post
        </button>
      </div>
    </header>
  )
}

function FilterBar({
  active,
  counts,
  sort,
  onFilter,
  onSort,
}: {
  active: FeedScope
  counts: Record<FeedScope, number>
  sort: FeedSort
  onFilter: (scope: FeedScope) => void
  onSort: (sort: FeedSort) => void
}) {
  return (
    <div className="feed-filterbar" role="tablist" aria-label="Feed filters">
      {FILTERS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`feed-chip ${active === key ? 'is-active' : ''}`}
          onClick={() => onFilter(key)}
        >
          <Icon size={13} />
          {label}
          <span>{counts[key]}</span>
        </button>
      ))}
      <div className="feed-filter-spacer" />
      <label className="feed-sort">
        <span>Sort</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as FeedSort)}>
          <option value="latest">Latest</option>
          <option value="top_week">Top this week</option>
          <option value="top_month">Top this month</option>
        </select>
      </label>
    </div>
  )
}

function FeedTweaks({
  showRail,
  showComposer,
  highlightMilestones,
  density,
  onShowRail,
  onShowComposer,
  onHighlightMilestones,
  onDensity,
}: {
  showRail: boolean
  showComposer: boolean
  highlightMilestones: boolean
  density: FeedDensity
  onShowRail: (value: boolean) => void
  onShowComposer: (value: boolean) => void
  onHighlightMilestones: (value: boolean) => void
  onDensity: (value: FeedDensity) => void
}) {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div className="feed-tweaks" aria-label="Feed display controls">
      <label><input type="checkbox" checked={showRail} onChange={(e) => onShowRail(e.target.checked)} /> Rail</label>
      <label><input type="checkbox" checked={showComposer} onChange={(e) => onShowComposer(e.target.checked)} /> Composer</label>
      <label><input type="checkbox" checked={highlightMilestones} onChange={(e) => onHighlightMilestones(e.target.checked)} /> Highlights</label>
      <label>
        Density
        <select value={density} onChange={(e) => onDensity(e.target.value as FeedDensity)}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label>
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </label>
    </div>
  )
}

const FeedComposer = forwardRef<HTMLTextAreaElement>((_, ref) => {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [destination, setDestination] = useState<Destination>({ type: 'public', id: '', name: 'Public' })
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: myLeagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: !!currentUser,
  })
  const { data: myClubs } = useQuery({
    queryKey: ['my-clubs'],
    queryFn: () => clubsApi.listMine(),
    enabled: !!currentUser,
  })

  const mutation = useMutation({
    mutationFn: () => postApi.create({
      body: body.trim(),
      league_id: destination.type === 'league' ? destination.id : undefined,
      club_id: destination.type === 'club' ? destination.id : undefined,
      visibility: destination.type === 'public' ? 'public' : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setBody('')
      toast('Posted', 'success')
    },
    onError: () => toast('Failed to create post', 'error'),
  })

  if (!currentUser) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim()) mutation.mutate()
  }

  return (
    <form className="feed-composer" onSubmit={submit}>
      <div className="composer-row">
        <UserAvatar user={currentUser} size={28} showHoverCard={false} />
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          placeholder="Share an update, log a card, ask a question..."
          aria-label="Post body"
        />
      </div>
      <div className="composer-actions">
        <div className="composer-tools">
          <button type="button"><CircleDot size={13} />Card</button>
          <button type="button"><Image size={13} />Image</button>
          <button type="button" aria-label="Mention"><AtSign size={13} /></button>
        </div>
        <div className="composer-right">
          <div className="dest-picker">
            <button type="button" className="dest-btn" onClick={() => setMenuOpen((v) => !v)}>
              {destination.type === 'club' ? <Users size={13} /> : <Trophy size={13} />}
              {destination.name}
              <ChevronDown size={13} />
            </button>
            {menuOpen && (
              <div className="dest-menu">
                <button type="button" className="dest-item" onClick={() => { setDestination({ type: 'public', id: '', name: 'Public' }); setMenuOpen(false) }}>
                  <Globe size={13} /> Public
                </button>
                <p>Your leagues</p>
                {(myLeagues?.items ?? []).map((league) => (
                  <button key={league.id} type="button" className="dest-item" onClick={() => { setDestination({ type: 'league', id: league.id, name: league.name }); setMenuOpen(false) }}>
                    <Trophy size={13} /> {league.name}
                  </button>
                ))}
                <p>Your clubs</p>
                {(myClubs?.items ?? []).map((club) => (
                  <button key={club.id} type="button" className="dest-item" onClick={() => { setDestination({ type: 'club', id: club.id, name: club.name }); setMenuOpen(false) }}>
                    <Users size={13} /> {club.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="feed-btn feed-btn-gold" disabled={!body.trim() || mutation.isPending}>
            <Send size={13} />
            Post
          </button>
        </div>
      </div>
    </form>
  )
})
FeedComposer.displayName = 'FeedComposer'

function FeedPostArticle({
  post,
  muted,
  commentsOpen,
  onToggleComments,
}: {
  post: FeedPost
  muted: boolean
  commentsOpen: boolean
  onToggleComments: () => void
}) {
  if (post.kind === 'join') {
    return <JoinPost post={post} muted={muted} />
  }

  const className = [
    'feed-post',
    `post-${post.kind}`,
    muted ? 'post-muted' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={className}>
      {post.kind === 'pb' && <PersonalBestStripe post={post} />}
      <div className="post-body">
        <PostHead post={post} />
        {post.kind === 'pb' && <PersonalBestPost post={post} />}
        {post.kind === 'score' && <ScorePost post={post} />}
        {post.kind === 'achievement' && <AchievementPost post={post} />}
        {post.kind === 'text' && <TextPost post={post} />}
        {post.kind === 'standings' && <StandingsPost />}
        <EngagementBar post={post} commentsOpen={commentsOpen} onToggleComments={onToggleComments} />
        {commentsOpen && <InlineComments post={post} />}
      </div>
    </article>
  )
}

function PostHead({ post }: { post: FeedPost }) {
  const prefs = useRegionalPrefs()
  const item = post.activity
  const date = formatDate(item.created_at, prefs)

  return (
    <header className="post-head">
      <UserAvatar
        user={{ id: item.user_id, display_name: item.display_name, avatar_url: item.avatar_url }}
        size={28}
        linkToProfile
      />
      <div className="post-head-body">
        <div className="post-head-line">
          <Link to="/users/$id" params={{ id: item.user_id }} className="post-who">{item.display_name}</Link>
          <span className="post-handle">{relativeHandle(item.display_name)}</span>
          <span className="post-dot">.</span>
          <span className="post-date">{date}</span>
        </div>
        {post.where && post.whereType && post.whereId && <SourcePill post={post} />}
      </div>
      {post.kind === 'pb' && <span className="post-pinned">Pinned</span>}
    </header>
  )
}

function SourcePill({ post }: { post: FeedPost }) {
  if (!post.where || !post.whereId || !post.whereType) return null
  if (post.whereType === 'league') {
    return (
      <Link to="/leagues/$id" params={{ id: post.whereId }} className="source-pill">
        <Trophy size={11} />
        {post.where}
      </Link>
    )
  }
  return (
    <Link to="/clubs/$id" params={{ id: post.whereId }} className="source-pill">
      <Users size={11} />
      {post.where}
    </Link>
  )
}

function PersonalBestStripe({ post }: { post: FeedPost }) {
  const delta = numericMeta(post.activity, 'pb_delta')
  return (
    <div className="post-celebrate-stripe">
      <Trophy size={13} />
      New personal best{delta != null ? ` - +${delta} over previous` : ''}
    </div>
  )
}

function PersonalBestPost({ post }: { post: FeedPost }) {
  const previous = numericMeta(post.activity, 'previous_best')
  const delta = numericMeta(post.activity, 'pb_delta')

  return (
    <div className="pb-grid">
      <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={96} />
      <div className="pb-stack">
        <div className="pb-score">
          <span className="num">{post.score ?? '--'}</span>
          {post.x != null && <span className="x">{post.x}<small>X</small></span>}
        </div>
        <p className="pb-was">
          {previous != null ? <>previous best <span>{previous}</span></> : 'previous best unavailable'}
          {delta != null && <> <strong>+{delta}</strong></>}
        </p>
        <ScoreMeta post={post} />
      </div>
    </div>
  )
}

function ScorePost({ post }: { post: FeedPost }) {
  return (
    <div className="score-grid">
      <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={78} />
      <div className="score-stack">
        <div className="score-line">
          <span className="num">{post.score ?? '--'}</span>
          {post.x != null && <span className="x">{post.x}<small>X</small></span>}
        </div>
        <ScoreMeta post={post} />
      </div>
    </div>
  )
}

function ScoreMeta({ post }: { post: FeedPost }) {
  const rifle = post.activity.metadata?.rifle_name
  const pellet = post.activity.metadata?.pellet_name
  return (
    <div className="score-meta">
      <span><Crosshair size={11} />{rifle || 'Rifle not set'}</span>
      <span><CircleDot size={11} />{pellet || 'Pellet not set'}</span>
      <span><Target size={11} />25m</span>
    </div>
  )
}

function AchievementPost({ post }: { post: FeedPost }) {
  const item = post.activity
  const AchIcon = iconForAchievement(item.metadata?.achievement_icon)
  return (
    <div className="achievement-block">
      <div className="badge-medallion">
        <span className="badge-rays" />
        <AchIcon size={28} />
      </div>
      <div className="achievement-text">
        <p className="achievement-eyebrow">Earned a badge</p>
        <h2>{item.metadata?.achievement_name ?? 'Badge earned'}</h2>
        {item.metadata?.achievement_description && <p>{item.metadata.achievement_description}</p>}
        <div className="achievement-meta">
          <span className="rarity rarity-uncommon">Uncommon</span>
          <span>earned by SUB12 shooters</span>
        </div>
      </div>
    </div>
  )
}

function TextPost({ post }: { post: FeedPost }) {
  const item = post.activity
  const attachmentType = item.metadata?.attachment_type
  const attachmentId = item.metadata?.attachment_target_id
  const body = post.body?.trim()

  return (
    <div className="text-post-body">
      {body ? <p>{body}</p> : <p>{fallbackText(item)}</p>}
      {attachmentType === 'score_card' && attachmentId && (
        <Link to="/scores/$id" params={{ id: attachmentId }} className="attachment-link">
          <Target size={13} />
          View score card
        </Link>
      )}
      {attachmentType === 'pellet_test' && attachmentId && (
        <Link to="/pellet-testing/$id" params={{ id: attachmentId }} className="attachment-link">
          <CircleDot size={13} />
          View pellet test
        </Link>
      )}
    </div>
  )
}

function StandingsPost() {
  return (
    <div className="standings-block">
      <div className="rank-arrow">
        <span className="rank-from">4<small>th</small></span>
        <Zap size={14} />
        <span className="rank-to">3<small>rd</small></span>
      </div>
      <div className="standings-text">
        <p className="standings-headline"><strong>Shooter</strong> moved up to <strong>3rd</strong></p>
        <p className="standings-sub">in league standings</p>
      </div>
    </div>
  )
}

function JoinPost({ post, muted }: { post: FeedPost; muted: boolean }) {
  const prefs = useRegionalPrefs()
  const item = post.activity
  const target = post.where ?? (post.whereType === 'club' ? 'a club' : 'a league')

  return (
    <article className={`feed-post post-join ${muted ? 'post-muted' : ''}`}>
      <div className="join-row">
        <UserAvatar user={{ id: item.user_id, display_name: item.display_name, avatar_url: item.avatar_url }} size={28} linkToProfile />
        <p>
          <Link to="/users/$id" params={{ id: item.user_id }}>{item.display_name}</Link>
          {' joined '}
          {post.whereType === 'club' && post.whereId ? (
            <Link to="/clubs/$id" params={{ id: post.whereId }} className="join-target"><Users size={11} />{target}</Link>
          ) : post.whereId ? (
            <Link to="/leagues/$id" params={{ id: post.whereId }} className="join-target"><Trophy size={11} />{target}</Link>
          ) : (
            <span>{target}</span>
          )}
          <span className="join-date">{formatDate(item.created_at, prefs)}</span>
        </p>
        <button type="button" className="feed-btn feed-btn-outline">Follow</button>
      </div>
    </article>
  )
}

function EngagementBar({
  post,
  commentsOpen,
  onToggleComments,
}: {
  post: FeedPost
  commentsOpen: boolean
  onToggleComments: () => void
}) {
  const item = post.activity
  const [bookmarked, setBookmarked] = useState(false)
  const canScoreInteract = item.target_type === 'score_card' && !!item.target_id
  const canPostInteract = item.type === 'post_created' && !!item.target_id

  return (
    <div className="post-engagement">
      {canScoreInteract ? (
        <LikeButton targetId={item.target_id!} targetType="score_card" initialLiked={item.is_liked} initialCount={item.like_count} size={15} />
      ) : canPostInteract ? (
        <LikeButton targetId={item.target_id!} targetType="post" initialLiked={item.is_liked} initialCount={item.like_count} size={15} />
      ) : (
        <button type="button" className="act" disabled>
          <Heart size={15} />
          {item.like_count || 0}
        </button>
      )}
      <button type="button" className={`act ${commentsOpen ? 'active' : ''}`} onClick={onToggleComments}>
        <MessageSquare size={15} />
        {item.comment_count || 0}
      </button>
      <button type="button" className={`act ${bookmarked ? 'active' : ''}`} onClick={() => setBookmarked((v) => !v)} aria-label="Bookmark">
        <Bookmark size={15} />
      </button>
      <button type="button" className="act" onClick={() => sharePost(post)} aria-label="Share">
        <Share2 size={15} />
      </button>
      <span className="post-engagement-spacer" />
      <button type="button" className="act subtle" aria-label="More">
        <MoreHorizontal size={15} />
      </button>
    </div>
  )
}

function InlineComments({ post }: { post: FeedPost }) {
  const prefs = useRegionalPrefs()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const item = post.activity
  const scoreTarget = item.target_type === 'score_card' ? item.target_id : undefined
  const postTarget = item.type === 'post_created' ? item.target_id : undefined
  const targetId = scoreTarget ?? postTarget
  const targetKind = scoreTarget ? 'score' : postTarget ? 'post' : null

  const { data } = useQuery({
    queryKey: targetKind === 'score' ? ['score-cards', targetId, 'comments'] : ['posts', targetId, 'comments'],
    queryFn: () => targetKind === 'score' ? scoreCardApi.listComments(targetId!) : postApi.listComments(targetId!),
    enabled: !!targetId,
  })

  const mutation = useMutation({
    mutationFn: () => targetKind === 'score'
      ? scoreCardApi.createComment(targetId!, body.trim())
      : postApi.createComment(targetId!, body.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: targetKind === 'score' ? ['score-cards', targetId, 'comments'] : ['posts', targetId, 'comments'] })
      setBody('')
    },
  })

  if (!targetId || !targetKind) {
    return (
      <div className="post-comments">
        <p className="comment-empty">Comments are not available for this activity yet.</p>
      </div>
    )
  }

  const topComment = data?.items?.[0]

  return (
    <div className="post-comments">
      {topComment ? (
        <div className="comment">
          <UserAvatar user={{ id: topComment.user_id, display_name: topComment.display_name, avatar_url: topComment.avatar_url }} size={22} linkToProfile />
          <div className="comment-body">
            <div className="comment-meta">
              <span>{topComment.display_name}</span>
              <time>{formatDate(topComment.created_at, prefs)}</time>
            </div>
            <p>{topComment.body}</p>
          </div>
        </div>
      ) : (
        <p className="comment-empty">No comments yet.</p>
      )}
      {currentUser && (
        <form className="comment-compose" onSubmit={(e) => { e.preventDefault(); if (body.trim()) mutation.mutate() }}>
          <UserAvatar user={currentUser} size={22} showHoverCard={false} />
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply..." maxLength={500} />
          <button type="submit" className="feed-icon-send" disabled={!body.trim() || mutation.isPending} aria-label="Send reply">
            <Send size={13} />
          </button>
        </form>
      )}
    </div>
  )
}

function TargetPreview({ seed, xCount, size }: { seed: string | number; xCount: number; size: number }) {
  const shots = targetShots(seed, xCount)
  return (
    <svg className="target-preview" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--surface-2)" stroke="var(--line)" />
      {[38, 30, 22].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--line-2)" strokeWidth="0.8" />)}
      <circle cx="50" cy="50" r="18" fill="var(--gold-tint)" stroke="var(--gold-soft)" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="8" fill="var(--gold-soft)" opacity="0.6" />
      <circle cx="50" cy="50" r="2.5" fill="var(--gold)" />
      {shots.map((shot, index) => (
        <circle key={index} cx={shot.x} cy={shot.y} r="2.4" fill="var(--ink)" stroke="var(--surface)" strokeWidth="0.5" />
      ))}
    </svg>
  )
}

function FeedRail({ posts }: { posts: FeedPost[] }) {
  const leagueCounts = countByName(posts, 'league')
  const clubCounts = countByName(posts, 'club')
  const { data: myLeagues } = useQuery({ queryKey: ['my-leagues'], queryFn: () => leagueApi.listMine() })
  const { data: myClubs } = useQuery({ queryKey: ['my-clubs'], queryFn: () => clubsApi.listMine() })
  const { data: achievements } = useQuery({ queryKey: ['achievements', 'me'], queryFn: () => achievementApi.listMine() })

  const trending = [
    ...(myLeagues?.items ?? []).map((l) => ({ id: l.id, name: l.name, type: 'league' as const, count: leagueCounts.get(l.name) ?? 0 })),
    ...(myClubs?.items ?? []).map((c) => ({ id: c.id, name: c.name, type: 'club' as const, count: clubCounts.get(c.name) ?? 0 })),
  ].sort((a, b) => b.count - a.count).slice(0, 5)

  const deadlines = (myLeagues?.items ?? [])
    .filter((league) => league.ends_on)
    .map((league) => ({ id: league.id, name: league.name, due: league.ends_on! }))
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .slice(0, 3)

  return (
    <aside className="feed-rail">
      <RailCard title="Trending" icon={<Flame size={12} />}>
        {trending.length === 0 && <RailEmpty>No memberships yet.</RailEmpty>}
        {trending.map((item, index) => (
          <RailEntityRow key={`${item.type}-${item.id}`} item={item} hot={index === 0 && item.count > 0} />
        ))}
      </RailCard>
      <RailCard title="Upcoming deadlines" icon={<Target size={12} />}>
        {deadlines.length === 0 && <RailEmpty>No dated league deadlines.</RailEmpty>}
        {deadlines.map((deadline) => <DeadlineRow key={deadline.id} deadline={deadline} />)}
      </RailCard>
      <RailCard title="Recent achievements" icon={<Award size={12} />}>
        {(achievements?.items ?? []).slice(0, 4).map((achievement, index) => {
          const Icon = iconForAchievement(achievement.icon)
          return (
            <div className="rail-ach" key={achievement.id}>
              <span className={`rail-ach-medal ${index === 0 ? 'is-new' : ''}`}><Icon size={14} /></span>
              <div>
                <p>{achievement.name}{index === 0 && <span>New</span>}</p>
                <small>{achievement.description}</small>
              </div>
            </div>
          )
        })}
        {(achievements?.items ?? []).length === 0 && <RailEmpty>No achievements yet.</RailEmpty>}
      </RailCard>
    </aside>
  )
}

function RailCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rail-card">
      <h2>{icon}{title}</h2>
      <div className="rail-body">{children}</div>
    </section>
  )
}

function RailEntityRow({
  item,
  hot,
}: {
  item: { id: string; name: string; type: 'league' | 'club'; count: number }
  hot: boolean
}) {
  const body = (
    <>
      <span className={`rail-thumb rail-thumb-${item.type === 'league' ? 'gold' : 'olive'}`}>
        {item.type === 'league' ? <Trophy size={13} /> : <Users size={13} />}
      </span>
      <span className="rail-row-body">
        <strong>{item.name}{hot && <Flame size={11} />}</strong>
        <small>{item.count} loaded posts this week</small>
      </span>
    </>
  )
  return item.type === 'league' ? (
    <Link to="/leagues/$id" params={{ id: item.id }} className="rail-row">{body}</Link>
  ) : (
    <Link to="/clubs/$id" params={{ id: item.id }} className="rail-row">{body}</Link>
  )
}

function DeadlineRow({ deadline }: { deadline: { id: string; name: string; due: string } }) {
  const days = Math.ceil((Date.parse(deadline.due) - Date.now()) / (24 * 60 * 60 * 1000))
  const urgency = days <= 1 ? 'urgent' : days <= 7 ? 'soon' : 'ok'
  return (
    <Link to="/leagues/$id" params={{ id: deadline.id }} className={`rail-deadline ${urgency}`}>
      <span />
      <strong>League closes</strong>
      <small>{deadline.name}</small>
      <time>{days <= 0 ? 'today' : `${days}d`}</time>
    </Link>
  )
}

function RailEmpty({ children }: { children: ReactNode }) {
  return <p className="rail-empty">{children}</p>
}

function FeedSkeleton() {
  return (
    <div className="feed-stream" aria-busy>
      {Array.from({ length: 4 }).map((_, index) => <div key={index} className="feed-skeleton" />)}
    </div>
  )
}

function FeedEnd() {
  return (
    <div className="feed-end">
      <Sparkles size={18} />
      <span>You are all caught up</span>
    </div>
  )
}

function numericMeta(item: ActivityItem, key: string): number | null {
  const value = (item.metadata as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'number' ? value : null
}

function fallbackText(item: ActivityItem): string {
  switch (item.type) {
    case 'commented':
      return 'Commented on a score card.'
    case 'pellet_test_posted':
      return 'Posted a pellet test.'
    case 'league_round_opened':
      return item.metadata?.round_name ? `New round in ${item.metadata.league_name ?? 'a league'}: ${item.metadata.round_name}.` : 'Opened a league round.'
    case 'league_season_started':
      return item.metadata?.season_name ? `New season in ${item.metadata.league_name ?? 'a league'}: ${item.metadata.season_name}.` : 'Started a league season.'
    case 'feature_request_created':
      return item.metadata?.title ? `Feature request: ${item.metadata.title}.` : 'Created a feature request.'
    case 'feature_request_implemented':
      return item.metadata?.title ? `Feature implemented: ${item.metadata.title}.` : 'Feature implemented.'
    default:
      return 'Posted an update.'
  }
}

function sharePost(post: FeedPost) {
  const url = `${window.location.origin}/feed`
  const text = `${post.activity.display_name} on SUB12`
  if (navigator.share) {
    navigator.share({ title: 'SUB12 Feed', text, url }).catch(() => {})
    return
  }
  navigator.clipboard?.writeText(url).then(
    () => toast('Feed link copied', 'success'),
    () => toast('Unable to copy link', 'error'),
  )
}
