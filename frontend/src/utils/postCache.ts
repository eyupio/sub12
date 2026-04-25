import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { FeedResponse } from '../api/activity'
import type { Post } from '../api/posts'

function truncateForPreview(body: string, maxLen = 100): string {
  const trimmed = body.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen)}...`
}

function updateFeedPostPreview(
  data: InfiniteData<FeedResponse, unknown> | undefined,
  post: Post,
): InfiniteData<FeedResponse, unknown> | undefined {
  if (!data) return data

  const pages = data.pages.map((page) => {
    const items = page.items.map((item) => {
      if (item.type !== 'post_created' || item.target_id !== post.id) return item
      return {
        ...item,
        metadata: {
          ...(item.metadata ?? {}),
          body_preview: truncateForPreview(post.body),
          edited_at: post.updated_at,
        },
      }
    })
    return { ...page, items }
  })

  return { ...data, pages }
}

function removeFeedPost(
  data: InfiniteData<FeedResponse, unknown> | undefined,
  postID: string,
): InfiniteData<FeedResponse, unknown> | undefined {
  if (!data) return data

  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => !(item.type === 'post_created' && item.target_id === postID)),
  }))

  return { ...data, pages }
}

function updatePostListItem(
  current: { items: Post[] } | undefined,
  post: Post,
): { items: Post[] } | undefined {
  if (!current) return current
  return {
    ...current,
    items: current.items.map((item) => (item.id === post.id ? { ...item, ...post } : item)),
  }
}

function removePostListItem(
  current: { items: Post[] } | undefined,
  postID: string,
): { items: Post[] } | undefined {
  if (!current) return current
  return {
    ...current,
    items: current.items.filter((item) => item.id !== postID),
  }
}

export function applyPostEditToCaches(queryClient: QueryClient, post: Post) {
  queryClient.setQueryData(['posts', post.id], post)

  if (post.league_id) {
    queryClient.setQueryData<{ items: Post[] } | undefined>(
      ['league', post.league_id, 'posts'],
      (current) => updatePostListItem(current, post),
    )
  }

  if (post.club_id) {
    queryClient.setQueryData<{ items: Post[] } | undefined>(
      ['club', post.club_id, 'posts'],
      (current) => updatePostListItem(current, post),
    )
  }

  queryClient.setQueriesData<InfiniteData<FeedResponse, unknown> | undefined>(
    { queryKey: ['feed'] },
    (current) => updateFeedPostPreview(current, post),
  )
}

export function applyPostDeleteToCaches(
  queryClient: QueryClient,
  postID: string,
  scope?: { leagueID?: string; clubID?: string },
) {
  queryClient.removeQueries({ queryKey: ['posts', postID] })

  if (scope?.leagueID) {
    queryClient.setQueryData<{ items: Post[] } | undefined>(
      ['league', scope.leagueID, 'posts'],
      (current) => removePostListItem(current, postID),
    )
  }

  if (scope?.clubID) {
    queryClient.setQueryData<{ items: Post[] } | undefined>(
      ['club', scope.clubID, 'posts'],
      (current) => removePostListItem(current, postID),
    )
  }

  queryClient.setQueriesData<InfiniteData<FeedResponse, unknown> | undefined>(
    { queryKey: ['feed'] },
    (current) => removeFeedPost(current, postID),
  )
}
