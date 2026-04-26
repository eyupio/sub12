import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign,
  Award,
  ChevronDown,
  CircleDot,
  Crosshair,
  Edit3,
  Flag,
  Flame,
  FlaskConical,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { api } from '../api/client'
import { activityApi, type ActivityItem, type FeedFilter } from '../api/activity'
import { achievementApi } from '../api/achievements'
import { clubsApi } from '../api/clubs'
import { leagueApi } from '../api/leagues'
import { communityReviewApi } from '../api/communityReview'
import { postApi } from '../api/posts'
import { scoreCardApi, type ScoreCardSummary } from '../api/scoreCards'
import { pelletTestApi, type PelletTestSessionSummary } from '../api/pelletTesting'
import { UserAvatar } from '../components/UserAvatar'
import { LikeButton } from '../components/LikeButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImageModal } from '../components/ImageModal'
import { PickerModal, type PickerItem } from '../components/PickerModal'
import { MentionPopover } from '../components/MentionPopover'
import { ReportDialog } from '../components/ReportDialog'
import { handleToMention } from '../utils/mention'
import { iconForAchievement } from '../utils/achievementIcons'
import { applyPostDeleteToCaches, applyPostEditToCaches } from '../utils/postCache'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import {
  feedCounts,
  filterFeedPosts,
  normalizeActivity,
  sortFeedPosts,
  targetShots,
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
  const [expandedComments, setExpandedComments] = useState<string | null>(null)

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

  return (
    <div className="feed-shell">
      <div className="feed-page with-rail">
        <main className="feed-main" aria-label="Social feed">
          <FeedHeader />
          <FilterBar
            active={activeFilter}
            counts={counts}
            sort={sort}
            onFilter={setActiveFilter}
            onSort={setSort}
          />
          <FeedComposer />

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
                muted={false}
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

        <FeedRail posts={allPosts} />
      </div>
    </div>
  )
}

function FeedHeader() {
  return (
    <header className="feed-header">
      <div>
        <h1 className="t-page-title">Feed</h1>
      </div>
      <div className="feed-header-actions">
        <Link to="/notifications" className="feed-btn feed-btn-outline">
          <Zap size={13} />
          Notifications
        </Link>
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

type LinkedAttachment =
  | { kind: 'card'; id: string; label: string; sub: string; thumb?: string }
  | { kind: 'pellet'; id: string; label: string; sub: string; thumb?: string }

function FeedComposer() {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [body, setBody] = useState('')
  const [destination, setDestination] = useState<Destination>({ type: 'public', id: '', name: 'Public' })
  const [menuOpen, setMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState<{ image_url: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState<null | 'card' | 'pellet'>(null)
  const [linked, setLinked] = useState<LinkedAttachment | null>(null)
  const [mentionState, setMentionState] = useState<{ start: number; query: string } | null>(null)

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

  const { data: cardsList, isLoading: cardsLoading } = useQuery({
    queryKey: ['my-cards-picker'],
    queryFn: () => scoreCardApi.list(20, 0, 'personal'),
    enabled: pickerOpen === 'card',
  })
  const { data: pelletsList, isLoading: pelletsLoading } = useQuery({
    queryKey: ['my-pellets-picker'],
    queryFn: () => pelletTestApi.list(20, 0, 'all'),
    enabled: pickerOpen === 'pellet',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payloadAttachments: { type: string; target_id?: string; image_url?: string }[] = []
      if (linked?.kind === 'card') payloadAttachments.push({ type: 'score_card', target_id: linked.id })
      if (linked?.kind === 'pellet') payloadAttachments.push({ type: 'pellet_test', target_id: linked.id })
      payloadAttachments.push(...attachments.map((a) => ({ type: 'image', image_url: a.image_url })))
      return postApi.create({
        body: body.trim(),
        league_id: destination.type === 'league' ? destination.id : undefined,
        club_id: destination.type === 'club' ? destination.id : undefined,
        visibility: destination.type === 'public' ? 'public' : undefined,
        attachments: payloadAttachments,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setBody('')
      setAttachments([])
      setLinked(null)
      toast('Posted', 'success')
    },
    onError: () => toast('Failed to create post', 'error'),
  })

  if (!currentUser) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim() || attachments.length > 0 || linked) mutation.mutate()
  }

  const handleImagePick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.upload<{ id: string; url: string }>('/images', fd)
      setAttachments((prev) => [...prev, { image_url: res.url }])
    } catch {
      toast('Failed to upload image', 'error')
    } finally {
      setUploading(false)
    }
  }

  const insertMention = () => {
    const ta = textareaRef.current
    if (!ta) {
      setBody((b) => b + '@')
      setMentionState({ start: body.length, query: '' })
      return
    }
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    const next = body.slice(0, start) + '@' + body.slice(end)
    setBody(next)
    setMentionState({ start, query: '' })
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + 1
      ta.setSelectionRange(pos, pos)
    })
  }

  const handleBodyChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setBody(value)
    const caret = e.target.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) {
      setMentionState(null)
      return
    }
    const prevChar = at > 0 ? before[at - 1] : ' '
    if (!/\s|^/.test(prevChar) && at !== 0) {
      setMentionState(null)
      return
    }
    const fragment = before.slice(at + 1)
    if (/\s/.test(fragment)) {
      setMentionState(null)
      return
    }
    setMentionState({ start: at, query: fragment })
  }

  const completeMention = (handle: string) => {
    if (!mentionState) return
    const before = body.slice(0, mentionState.start)
    const afterStart = mentionState.start + 1 + mentionState.query.length
    const after = body.slice(afterStart)
    const insert = `@${handle} `
    const next = before + insert + after
    setBody(next)
    setMentionState(null)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const pos = before.length + insert.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx))

  const cardItems: PickerItem[] = (cardsList?.items ?? []).map((c: ScoreCardSummary) => ({
    id: c.id,
    primary: `${c.total_score} (${c.x_count}X)`,
    secondary: new Date(c.shot_at).toLocaleDateString(),
    thumbUrl: c.card_image_url,
    thumbFallback: <Target size={16} />,
  }))
  const pelletItems: PickerItem[] = (pelletsList?.items ?? []).map((p: PelletTestSessionSummary) => ({
    id: p.id,
    primary: `${p.pellet_brand} ${p.pellet_model}`,
    secondary: p.best_group_size_mm != null
      ? `Best ${p.best_group_size_mm.toFixed(2)}mm · ${new Date(p.test_date).toLocaleDateString()}`
      : new Date(p.test_date).toLocaleDateString(),
    thumbUrl: p.first_image_url,
    thumbFallback: <FlaskConical size={16} />,
  }))

  const handleCardSelect = (id: string) => {
    const c = cardsList?.items.find((x) => x.id === id)
    if (!c) return
    setLinked({
      kind: 'card',
      id: c.id,
      label: `${c.total_score} (${c.x_count}X)`,
      sub: new Date(c.shot_at).toLocaleDateString(),
      thumb: c.card_image_url,
    })
    setPickerOpen(null)
  }
  const handlePelletSelect = (id: string) => {
    const p = pelletsList?.items.find((x) => x.id === id)
    if (!p) return
    setLinked({
      kind: 'pellet',
      id: p.id,
      label: `${p.pellet_brand} ${p.pellet_model}`,
      sub: p.best_group_size_mm != null ? `Best ${p.best_group_size_mm.toFixed(2)}mm` : new Date(p.test_date).toLocaleDateString(),
      thumb: p.first_image_url,
    })
    setPickerOpen(null)
  }

  return (
    <form className="feed-composer" onSubmit={submit}>
      <div className="composer-row" style={{ position: 'relative' }}>
        <UserAvatar user={currentUser} size={28} showHoverCard={false} />
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          rows={1}
          placeholder="Share an update, log a card, ask a question..."
          aria-label="Post body"
        />
        {mentionState && (
          <MentionPopover
            query={mentionState.query}
            onSelect={(u) => completeMention(handleToMention(u.display_name))}
            onClose={() => setMentionState(null)}
          />
        )}
      </div>
      {linked && (
        <div className="composer-attachments">
          <div className="composer-attachment composer-attachment-link">
            {linked.thumb ? (
              <img src={linked.thumb} alt="" />
            ) : (
              <span style={{ display: 'inline-flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                {linked.kind === 'card' ? <Target size={16} /> : <FlaskConical size={16} />}
              </span>
            )}
            <span style={{ marginLeft: 8, fontSize: 12 }}>
              {linked.kind === 'card' ? 'Card' : 'Pellet test'}: {linked.label}
            </span>
            <button type="button" aria-label="Remove link" onClick={() => setLinked(null)}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a, idx) => (
            <div key={idx} className="composer-attachment">
              <img src={a.image_url} alt="" />
              <button type="button" aria-label="Remove attachment" onClick={() => removeAttachment(idx)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <div className="composer-actions">
        <div className="composer-tools">
          <button type="button" onClick={() => setPickerOpen('card')}>
            <CircleDot size={13} />Card
          </button>
          <button type="button" onClick={() => setPickerOpen('pellet')}>
            <FlaskConical size={13} />Pellet test
          </button>
          <button type="button" onClick={handleImagePick} disabled={uploading}>
            <ImageIcon size={13} />{uploading ? 'Uploading...' : 'Image'}
          </button>
          <button type="button" aria-label="Mention" onClick={insertMention}>
            <AtSign size={13} />
          </button>
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
          <button
            type="submit"
            className="feed-btn feed-btn-gold"
            disabled={(!body.trim() && attachments.length === 0 && !linked) || mutation.isPending}
          >
            <Send size={13} />
            Post
          </button>
        </div>
      </div>
      <PickerModal
        open={pickerOpen === 'card'}
        title="Select a score card"
        items={cardItems}
        loading={cardsLoading}
        emptyMessage="You haven't logged any score cards yet."
        onSelect={handleCardSelect}
        onClose={() => setPickerOpen(null)}
      />
      <PickerModal
        open={pickerOpen === 'pellet'}
        title="Select a pellet test"
        items={pelletItems}
        loading={pelletsLoading}
        emptyMessage="You haven't logged any pellet tests yet."
        onSelect={handlePelletSelect}
        onClose={() => setPickerOpen(null)}
      />
    </form>
  )
}

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
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [adminFlagOpen, setAdminFlagOpen] = useState(false)
  const [editingPost, setEditingPost] = useState(false)
  const [draftBody, setDraftBody] = useState(post.body ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [adminConfirmHide, setAdminConfirmHide] = useState(false)
  const item = post.activity
  const isOwnPost = !!currentUser && item.type === 'post_created' && currentUser.id === item.user_id
  const reportTarget = feedReportTarget(post)
  const canReport = !!currentUser && !isOwnPost && !!reportTarget
  const canEdit = isOwnPost && !!item.target_id
  const isAdmin = currentUser?.role === 'admin'
  const canAdminModerate = isAdmin && !isOwnPost

  const updatePostMutation = useMutation({
    mutationFn: () => postApi.update(item.target_id!, draftBody.trim()),
    onSuccess: (updated) => {
      applyPostEditToCaches(queryClient, updated)
      setEditingPost(false)
      setMenuOpen(false)
      toast('Post updated', 'success')
    },
    onError: () => toast('Failed to update post', 'error'),
  })

  const deletePostMutation = useMutation({
    mutationFn: () => postApi.delete(item.target_id!),
    onSuccess: () => {
      applyPostDeleteToCaches(queryClient, item.target_id!, {
        leagueID: item.league_id,
        clubID: item.club_id,
      })
      setConfirmDelete(false)
      setMenuOpen(false)
      toast('Post deleted', 'success')
    },
    onError: () => toast('Failed to delete post', 'error'),
  })

  const adminHideMutation = useMutation({
    mutationFn: () => activityApi.adminHide(item.id),
    onSuccess: () => {
      setAdminConfirmHide(false)
      setMenuOpen(false)
      toast('Feed item removed', 'success')
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: () => toast('Failed to remove feed item', 'error'),
  })

  if (post.kind === 'join') {
    return <JoinPost post={post} muted={muted} commentsOpen={commentsOpen} onToggleComments={onToggleComments} />
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
        <PostHead
          post={post}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onStartEdit={() => {
            setDraftBody(post.body ?? '')
            setEditingPost(true)
            setMenuOpen(false)
          }}
          onStartDelete={() => {
            setConfirmDelete(true)
            setMenuOpen(false)
          }}
          onStartReport={() => {
            setReportOpen(true)
            setMenuOpen(false)
          }}
          onStartAdminHide={() => {
            setAdminConfirmHide(true)
            setMenuOpen(false)
          }}
          onStartAdminFlag={() => {
            setAdminFlagOpen(true)
            setMenuOpen(false)
          }}
          canEdit={canEdit}
          canReport={canReport}
          canAdminModerate={canAdminModerate}
          reportTargetType={reportTarget?.targetType}
        />
        {post.kind === 'pb' && <PersonalBestPost post={post} />}
        {post.kind === 'score' && <ScorePost post={post} />}
        {post.kind === 'achievement' && <AchievementPost post={post} />}
        {post.kind === 'review_request' && <ReviewRequestPost post={post} />}
        {post.kind === 'review_verified' && <ReviewVerifiedPost post={post} />}
        {post.kind === 'text' && (
          <TextPost
            post={post}
            editing={editingPost}
            draftBody={draftBody}
            onDraftChange={setDraftBody}
            onSave={() => updatePostMutation.mutate()}
            onCancelEdit={() => {
              setEditingPost(false)
              setDraftBody(post.body ?? '')
            }}
            isSaving={updatePostMutation.isPending}
          />
        )}
        {post.kind === 'standings' && <StandingsPost />}
        <EngagementBar post={post} commentsOpen={commentsOpen} onToggleComments={onToggleComments} />
        {commentsOpen && <InlineComments post={post} />}
      </div>
      {reportTarget && (
        <ReportDialog
          open={reportOpen}
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportOpen(false)}
        />
      )}
      {canAdminModerate && (
        <ReportDialog
          open={adminFlagOpen}
          targetType="activity"
          targetId={item.id}
          onClose={() => setAdminFlagOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete post?"
        message="This post will be permanently removed."
        onConfirm={() => deletePostMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={adminConfirmHide}
        title="Remove from feed?"
        message="This feed item will be hidden for everyone. You can restore it later from the database if needed."
        onConfirm={() => adminHideMutation.mutate()}
        onCancel={() => setAdminConfirmHide(false)}
      />
    </article>
  )
}

function feedReportTarget(post: FeedPost): { targetType: 'post' | 'score_card'; targetId: string } | null {
  if (post.activity.type === 'post_created' && post.activity.target_id) {
    return { targetType: 'post', targetId: post.activity.target_id }
  }
  if (post.activity.target_type === 'score_card' && post.activity.target_id) {
    return { targetType: 'score_card', targetId: post.activity.target_id }
  }
  return null
}

function PostHead({
  post,
  menuOpen,
  onToggleMenu,
  onStartEdit,
  onStartDelete,
  onStartReport,
  onStartAdminHide,
  onStartAdminFlag,
  canEdit,
  canReport,
  canAdminModerate,
  reportTargetType,
}: {
  post: FeedPost
  menuOpen: boolean
  onToggleMenu: () => void
  onStartEdit: () => void
  onStartDelete: () => void
  onStartReport: () => void
  onStartAdminHide: () => void
  onStartAdminFlag: () => void
  canEdit: boolean
  canReport: boolean
  canAdminModerate: boolean
  reportTargetType?: 'post' | 'score_card'
}) {
  const prefs = useRegionalPrefs()
  const item = post.activity
  const date = formatDate(item.created_at, prefs)
  const editedAt = item.type === 'post_created' ? item.metadata?.edited_at : undefined
  const editedLabel = editedAt ? formatDate(editedAt, prefs) : null

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
          {editedLabel && <span className="post-edited">Edited {editedLabel}</span>}
        </div>
        {post.where && post.whereType && post.whereId && <SourcePill post={post} />}
      </div>
      {post.kind === 'pb' && <span className="post-pinned">Pinned</span>}
      {(canEdit || canReport || canAdminModerate) && (
        <div className="post-menu-wrap">
          <button
            type="button"
            className="post-menu-trigger"
            aria-label="Feed item options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen && (
            <div className="post-menu" role="menu">
              {canEdit && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="post-menu-item"
                    onClick={onStartEdit}
                  >
                    <Edit3 size={12} />
                    Edit post
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="post-menu-item post-menu-item-danger"
                    onClick={onStartDelete}
                  >
                    <Trash2 size={12} />
                    Delete post
                  </button>
                </>
              )}
              {canReport && (
                <button
                  type="button"
                  role="menuitem"
                  className="post-menu-item"
                  onClick={onStartReport}
                >
                  <Flag size={12} />
                  Report {reportTargetType === 'score_card' ? 'score' : 'post'}
                </button>
              )}
              {canAdminModerate && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="post-menu-item"
                    onClick={onStartAdminFlag}
                  >
                    <Flag size={12} />
                    Flag as inappropriate
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="post-menu-item post-menu-item-danger"
                    onClick={onStartAdminHide}
                  >
                    <Trash2 size={12} />
                    Delete (admin)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
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
  const [zoom, setZoom] = useState(false)

  return (
    <div className="pb-grid">
      {post.cardImageUrl ? (
        <>
          <img
            className="score-thumb"
            src={post.cardImageUrl}
            alt="Score card"
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }}
            onClick={() => setZoom(true)}
          />
          {zoom && <ImageModal src={post.cardImageUrl} alt="Score card" onClose={() => setZoom(false)} />}
        </>
      ) : (
        <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={96} />
      )}
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
  const [zoom, setZoom] = useState(false)
  return (
    <div className="score-grid">
      {post.cardImageUrl ? (
        <>
          <img
            className="score-thumb"
            src={post.cardImageUrl}
            alt="Score card"
            style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }}
            onClick={() => setZoom(true)}
          />
          {zoom && <ImageModal src={post.cardImageUrl} alt="Score card" onClose={() => setZoom(false)} />}
        </>
      ) : (
        <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={78} />
      )}
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

function ReviewRequestPost({ post }: { post: FeedPost }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const required = post.activity.metadata?.required_confirmations ?? 3
  const targetId = post.activity.target_id
  const isOwner = !!currentUser && post.activity.user_id === currentUser.id

  const confirmMutation = useMutation({
    mutationFn: () => communityReviewApi.confirm(targetId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', targetId, 'community-review'] })
      toast('Card confirmed', 'success')
    },
    onError: (err) => {
      const status = err instanceof Error && 'status' in err ? (err as { status?: number }).status : 0
      if (status === 409) toast('Already confirmed', 'error')
      else if (status === 403) toast("Can't confirm your own card", 'error')
      else toast('Failed to confirm card', 'error')
    },
  })

  return (
    <div className="score-grid">
      {post.cardImageUrl ? (
        <img
          className="score-thumb"
          src={post.cardImageUrl}
          alt="Score card"
          style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 8 }}
        />
      ) : (
        <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={78} />
      )}
      <div className="score-stack">
        <div className="score-line">
          <span className="num">{post.score ?? '--'}</span>
          {post.x != null && <span className="x">{post.x}<small>X</small></span>}
        </div>
        <div className="score-meta">
          <span><Sparkles size={11} />Asked for community review · needs {required} confirmations</span>
        </div>
        {!isOwner && targetId && (
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            style={{ marginTop: 8, alignSelf: 'flex-start', padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-hover)', cursor: 'pointer' }}
          >
            {confirmMutation.isPending ? 'Confirming…' : 'Confirm this card'}
          </button>
        )}
      </div>
    </div>
  )
}

function ReviewVerifiedPost({ post }: { post: FeedPost }) {
  return (
    <div className="score-grid">
      {post.cardImageUrl ? (
        <img
          className="score-thumb"
          src={post.cardImageUrl}
          alt="Score card"
          style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 8 }}
        />
      ) : (
        <TargetPreview seed={post.targetSeed} xCount={post.x ?? 0} size={78} />
      )}
      <div className="score-stack">
        <div className="score-line">
          <span className="num">{post.score ?? '--'}</span>
          {post.x != null && <span className="x">{post.x}<small>X</small></span>}
        </div>
        <div className="score-meta">
          <span><Award size={11} />Verified by the community</span>
        </div>
      </div>
    </div>
  )
}

function TextPost({
  post,
  editing,
  draftBody,
  onDraftChange,
  onSave,
  onCancelEdit,
  isSaving,
}: {
  post: FeedPost
  editing: boolean
  draftBody: string
  onDraftChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  isSaving: boolean
}) {
  const item = post.activity
  const attachmentType = item.metadata?.attachment_type
  const attachmentId = item.metadata?.attachment_target_id
  const images = post.attachmentImageUrls ?? []
  const body = post.body?.trim()
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const hasContent = !!body || images.length > 0 || (attachmentType && attachmentId)

  return (
    <div className="text-post-body">
      {editing ? (
        <div className="post-edit-box">
          <textarea
            value={draftBody}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            className="post-edit-input"
            aria-label="Edit post body"
          />
          <div className="post-edit-actions">
            <button
              type="button"
              className="feed-btn"
              onClick={onSave}
              disabled={isSaving || !draftBody.trim()}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="feed-btn feed-btn-outline"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : body ? <p>{renderBodyWithMentions(body)}</p> : !hasContent ? <p>{fallbackText(item)}</p> : null}
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
      {images.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gap: 6,
            gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          }}
        >
          {images.map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt={images.length > 1 ? `Attached image ${idx + 1}` : 'Attached image'}
              style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }}
              onClick={() => setZoomSrc(src)}
            />
          ))}
        </div>
      )}
      {zoomSrc && <ImageModal src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  )
}

function renderBodyWithMentions(body: string): ReactNode {
  const parts = body.split(/(@[a-z0-9_]+)/gi)
  return parts.map((part, idx) => {
    if (/^@[a-z0-9_]+$/i.test(part)) {
      return (
        <span key={idx} style={{ color: 'var(--gold, #b08a3a)', fontWeight: 500 }}>
          {part}
        </span>
      )
    }
    return <span key={idx}>{part}</span>
  })
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

function JoinPost({ post, muted, commentsOpen, onToggleComments }: { post: FeedPost; muted: boolean; commentsOpen: boolean; onToggleComments: () => void }) {
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
      <EngagementBar post={post} commentsOpen={commentsOpen} onToggleComments={onToggleComments} />
      {commentsOpen && <InlineComments post={post} />}
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
  const canScoreInteract = item.target_type === 'score_card' && !!item.target_id
  const canPostInteract = item.type === 'post_created' && !!item.target_id
  const likeTargetId = canScoreInteract ? item.target_id! : canPostInteract ? item.target_id! : item.id
  const likeTargetType = canScoreInteract ? 'score_card' as const : canPostInteract ? 'post' as const : 'activity' as const

  return (
    <div className="post-engagement">
      <LikeButton targetId={likeTargetId} targetType={likeTargetType} initialLiked={item.is_liked} initialCount={item.like_count} size={15} />
      <button type="button" className={`act ${commentsOpen ? 'active' : ''}`} onClick={onToggleComments}>
        <MessageSquare size={15} />
        {item.comment_count || 0}
      </button>
      <button type="button" className="act" onClick={() => sharePost(post)} aria-label="Share">
        <Share2 size={15} />
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
  const canScoreInteract = item.target_type === 'score_card' && !!item.target_id
  const canPostInteract = item.type === 'post_created' && !!item.target_id
  const targetId = canScoreInteract ? item.target_id! : canPostInteract ? item.target_id! : item.id
  const targetKind = canScoreInteract ? 'score' : canPostInteract ? 'post' : 'activity'

  const queryKey = targetKind === 'score'
    ? ['score-cards', targetId, 'comments']
    : targetKind === 'post'
    ? ['posts', targetId, 'comments']
    : ['activities', targetId, 'comments']

  const { data } = useQuery({
    queryKey,
    queryFn: () => targetKind === 'score'
      ? scoreCardApi.listComments(targetId)
      : targetKind === 'post'
      ? postApi.listComments(targetId)
      : activityApi.listComments(targetId),
  })

  const mutation = useMutation({
    mutationFn: () => targetKind === 'score'
      ? scoreCardApi.createComment(targetId, body.trim())
      : targetKind === 'post'
      ? postApi.createComment(targetId, body.trim())
      : activityApi.createComment(targetId, body.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey })
      setBody('')
    },
  })


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
