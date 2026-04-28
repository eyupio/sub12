import { describe, expect, it } from 'vitest'
import type { ActivityItem } from '../../api/activity'
import {
  feedCounts,
  filterFeedPosts,
  normalizeActivity,
  sortFeedPosts,
  targetShots,
} from '../feedUtils'

function activity(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: 'a1',
    user_id: 'u1',
    display_name: 'Shooter One',
    star_level: 0,
    type: 'score_posted',
    visibility: 'public',
    like_count: 0,
    is_liked: false,
    comment_count: 0,
    created_at: '2026-04-25T10:00:00Z',
    ...overrides,
  }
}

describe('feedUtils', () => {
  it('normalizes live activity types into visual feed variants', () => {
    expect(normalizeActivity(activity({ type: 'personal_best' })).kind).toBe('pb')
    expect(normalizeActivity(activity({ type: 'achievement_earned' })).kind).toBe('achievement')
    expect(normalizeActivity(activity({ type: 'joined_club' })).kind).toBe('join')
    expect(normalizeActivity(activity({ type: 'post_created', metadata: { body_preview: 'Hello' } })).kind).toBe('text')
  })

  it('filters loaded posts by scope without requiring backend-only filters', () => {
    const posts = [
      normalizeActivity(activity({ id: 'own', user_id: 'me' })),
      normalizeActivity(activity({ id: 'league', league_id: 'l1' })),
      normalizeActivity(activity({ id: 'club', club_id: 'c1', visibility: 'followers' })),
    ]

    expect(filterFeedPosts(posts, 'following', 'me').map((p) => p.id)).toEqual(['league', 'club'])
    expect(filterFeedPosts(posts, 'leagues').map((p) => p.id)).toEqual(['league'])
    expect(filterFeedPosts(posts, 'clubs').map((p) => p.id)).toEqual(['club'])
    expect(feedCounts(posts, 'me')).toMatchObject({ for_you: 3, public: 2, following: 2 })
  })

  it('produces deterministic procedural target shots', () => {
    expect(targetShots('score-1', 3)).toEqual(targetShots('score-1', 3))
    expect(targetShots('score-1', 3)).not.toEqual(targetShots('score-2', 3))
  })

  it('renders the event_results_posted aggregate body with winner + band', () => {
    const post = normalizeActivity(
      activity({
        type: 'event_results_posted',
        metadata: {
          event_name: 'Spring HFT',
          winner: {
            display_name: 'Alice',
            category_label: 'Hunter',
            position: 1,
            points: 47,
            hit_count: 24,
            shots_recorded: 25,
          },
        },
      }),
    )
    expect(post.body).toBe('Results: Spring HFT — Winner: Alice (Hunter) · 47 pts')
  })

  it('falls back gracefully when event_results_posted has no winner', () => {
    const post = normalizeActivity(
      activity({ type: 'event_results_posted', metadata: { event_name: 'Quiet day' } }),
    )
    expect(post.body).toBe('Results posted: Quiet day')
  })

  it('sorts by latest and loaded engagement windows', () => {
    const now = Date.now()
    const isoDaysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
    const posts = [
      normalizeActivity(activity({ id: 'old', created_at: isoDaysAgo(15), like_count: 99 })),
      normalizeActivity(activity({ id: 'new', created_at: isoDaysAgo(0), like_count: 1 })),
      normalizeActivity(activity({ id: 'top', created_at: isoDaysAgo(1), like_count: 5, comment_count: 4 })),
    ]

    expect(sortFeedPosts(posts, 'latest').map((p) => p.id)).toEqual(['new', 'top', 'old'])
    expect(sortFeedPosts(posts, 'top_month').map((p) => p.id)[0]).toBe('old')
  })
})
