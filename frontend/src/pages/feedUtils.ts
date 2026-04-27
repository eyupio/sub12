import type { ActivityItem } from '../api/activity'

export type FeedScope = 'for_you' | 'public' | 'leagues' | 'clubs' | 'following'
export type FeedSort = 'latest' | 'top_week' | 'top_month'
export type FeedDensity = 'comfortable' | 'compact'

export type FeedPostKind =
  | 'pb'
  | 'score'
  | 'achievement'
  | 'join'
  | 'text'
  | 'standings'
  | 'review_request'
  | 'review_verified'

export interface FeedPost {
  id: string
  kind: FeedPostKind
  activity: ActivityItem
  score?: number
  x?: number
  where?: string
  whereType?: 'league' | 'club'
  whereId?: string
  body?: string
  targetSeed: number
  cardImageUrl?: string
  attachmentImageUrls?: string[]
}

export interface TargetShot {
  x: number
  y: number
}

export function hashSeed(seed: string | number | undefined): number {
  const text = String(seed ?? 'sub12')
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function targetShots(seed: string | number | undefined, xCount = 0): TargetShot[] {
  const rand = mulberry32(hashSeed(seed) * 1000 + 7)
  return Array.from({ length: 7 }, (_, i) => {
    const clustered = i < Math.min(7, Math.max(0, xCount))
    const radius = clustered ? rand() * 9 : 9 + rand() * 17.5
    const angle = rand() * Math.PI * 2
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
    }
  })
}

export function normalizeActivity(item: ActivityItem): FeedPost {
  const where = item.metadata?.league_name ?? item.metadata?.club_name
  const whereType = item.league_id ? 'league' : item.club_id ? 'club' : undefined
  const whereId = item.league_id ?? item.club_id
  const score = item.metadata?.total_score
  const x = item.metadata?.x_count
  const targetSeed = hashSeed(item.target_id ?? item.id)

  const cardImageUrl = item.metadata?.card_image_url || undefined
  if (item.type === 'personal_best' || item.metadata?.is_pb) {
    return { id: item.id, kind: 'pb', activity: item, score, x, where, whereType, whereId, targetSeed, cardImageUrl }
  }
  if (item.type === 'score_posted') {
    return { id: item.id, kind: 'score', activity: item, score, x, where, whereType, whereId, targetSeed, cardImageUrl }
  }
  if (item.type === 'achievement_earned') {
    return { id: item.id, kind: 'achievement', activity: item, targetSeed }
  }
  if (item.type === 'joined_league' || item.type === 'joined_club') {
    const joinWhere = item.metadata?.league_name ?? item.metadata?.club_name
    const joinType = item.type === 'joined_league' ? 'league' : 'club'
    return {
      id: item.id,
      kind: 'join',
      activity: item,
      where: joinWhere,
      whereType: joinType,
      whereId: item.target_id ?? item.league_id ?? item.club_id,
      targetSeed,
    }
  }
  if (item.type === 'community_review_requested') {
    return { id: item.id, kind: 'review_request', activity: item, score, x, targetSeed, cardImageUrl }
  }
  if (item.type === 'community_review_verified') {
    return { id: item.id, kind: 'review_verified', activity: item, score, x, targetSeed, cardImageUrl }
  }
  if (item.type === 'post_created') {
    return {
      id: item.id,
      kind: 'text',
      activity: item,
      where,
      whereType,
      whereId,
      body: item.metadata?.body_preview,
      targetSeed,
      attachmentImageUrls: item.metadata?.attachment_image_urls,
    }
  }
  return {
    id: item.id,
    kind: 'text',
    activity: item,
    where,
    whereType,
    whereId,
    body: fallbackBody(item),
    targetSeed,
  }
}

export function filterFeedPosts(posts: FeedPost[], scope: FeedScope, currentUserId?: string): FeedPost[] {
  switch (scope) {
    case 'public':
      return posts.filter((post) => post.activity.visibility === 'public')
    case 'leagues':
      return posts.filter((post) => !!post.activity.league_id)
    case 'clubs':
      return posts.filter((post) => !!post.activity.club_id)
    case 'following':
      return posts.filter((post) => post.activity.user_id !== currentUserId)
    case 'for_you':
    default:
      return posts
  }
}

export function sortFeedPosts(posts: FeedPost[], sort: FeedSort): FeedPost[] {
  const copy = [...posts]
  if (sort === 'latest') {
    return copy.sort((a, b) => Date.parse(b.activity.created_at) - Date.parse(a.activity.created_at))
  }

  const days = sort === 'top_week' ? 7 : 30
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  return copy
    .filter((post) => Date.parse(post.activity.created_at) >= since)
    .sort((a, b) => engagementScore(b) - engagementScore(a))
}

export function feedCounts(posts: FeedPost[], currentUserId?: string): Record<FeedScope, number> {
  return {
    for_you: posts.length,
    public: filterFeedPosts(posts, 'public', currentUserId).length,
    leagues: filterFeedPosts(posts, 'leagues', currentUserId).length,
    clubs: filterFeedPosts(posts, 'clubs', currentUserId).length,
    following: filterFeedPosts(posts, 'following', currentUserId).length,
  }
}

function engagementScore(post: FeedPost): number {
  return post.activity.like_count * 2 + post.activity.comment_count
}

function fallbackBody(item: ActivityItem): string {
  switch (item.type) {
    case 'commented':
      return 'Commented on a score card'
    case 'pellet_test_posted':
      return item.metadata?.best_group_mm != null
        ? `Posted a pellet test with a ${item.metadata.best_group_mm.toFixed(2)}mm best group`
        : 'Posted a pellet test'
    case 'league_round_opened':
      return item.metadata?.round_name ? `New round: ${item.metadata.round_name}` : 'New league round opened'
    case 'league_season_started':
      return item.metadata?.season_name ? `New season: ${item.metadata.season_name}` : 'New league season started'
    case 'feature_request_created':
      return item.metadata?.title ? `Feature request: ${item.metadata.title}` : 'Created a feature request'
    case 'feature_request_implemented':
      return item.metadata?.title ? `Feature implemented: ${item.metadata.title}` : 'Feature implemented'
    case 'event_created':
      return item.metadata?.event_name
        ? `Created live event: ${item.metadata.event_name}`
        : 'Created a live event'
    case 'event_joined':
      return item.metadata?.event_name
        ? `Joined live event: ${item.metadata.event_name}`
        : 'Joined a live event'
    case 'event_went_live':
      return item.metadata?.event_name
        ? `${item.metadata.event_name} is now live`
        : 'A live event has started'
    case 'event_completed_with_results': {
      const m = item.metadata ?? {}
      if (m.event_name && m.position && m.points != null) {
        const ordinal = m.position === 1 ? '1st' : m.position === 2 ? '2nd' : m.position === 3 ? '3rd' : `${m.position}th`
        return `Finished ${ordinal} at ${m.event_name} with ${m.points} pts`
      }
      return m.event_name ? `${m.event_name} results posted` : 'Live event results posted'
    }
    default:
      return 'Posted an update'
  }
}
