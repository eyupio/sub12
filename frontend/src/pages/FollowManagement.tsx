import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Search, UserMinus, CheckSquare, Square } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { usersApi, FollowListItem } from '../api/users'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { identiconDataUri } from '../utils/identicon'
import { SkeletonList } from '../components/Skeleton'

type Tab = 'following' | 'followers'

const PAGE_SIZE = 50

export default function FollowManagement() {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('following')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [confirmSingle, setConfirmSingle] = useState<FollowListItem | null>(null)

  const userId = currentUser?.id

  const { data: followingData, isLoading: followingLoading } = useQuery({
    queryKey: ['follow-management', 'following', userId],
    queryFn: () => usersApi.getFollowing(userId!, PAGE_SIZE, 0),
    enabled: !!userId,
  })

  const { data: followersData, isLoading: followersLoading } = useQuery({
    queryKey: ['follow-management', 'followers', userId],
    queryFn: () => usersApi.getFollowers(userId!, PAGE_SIZE, 0),
    enabled: !!userId,
  })

  const following = useMemo(() => followingData?.items ?? [], [followingData])
  const followers = useMemo(() => followersData?.items ?? [], [followersData])

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ['follow-management'] })
    queryClient.invalidateQueries({ queryKey: ['following', userId] })
    queryClient.invalidateQueries({ queryKey: ['followers', userId] })
    queryClient.invalidateQueries({ queryKey: ['user-profile', userId] })
  }

  const unfollowMutation = useMutation({
    mutationFn: (id: string) => usersApi.unfollow(id),
    onSuccess: (_, id) => {
      const removed = following.find((u) => u.user_id === id)
      toast(removed ? `Unfollowed ${removed.display_name}` : 'Unfollowed', 'success')
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      invalidateLists()
    },
    onError: () => toast('Failed to unfollow', 'error'),
  })

  const bulkUnfollowMutation = useMutation({
    mutationFn: (ids: string[]) => usersApi.bulkUnfollow(ids),
    onSuccess: ({ unfollowed }) => {
      toast(
        unfollowed === 1
          ? 'Unfollowed 1 user'
          : `Unfollowed ${unfollowed} users`,
        'success',
      )
      setSelected(new Set())
      invalidateLists()
    },
    onError: () => toast('Failed to unfollow users', 'error'),
  })

  const activeItems = tab === 'following' ? following : followers

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeItems
    return activeItems.filter((item) =>
      item.display_name.toLowerCase().includes(q),
    )
  }, [activeItems, query])

  const selectedItems = useMemo(
    () => following.filter((u) => selected.has(u.user_id)),
    [following, selected],
  )

  const allVisibleSelected =
    tab === 'following' &&
    filtered.length > 0 &&
    filtered.every((u) => selected.has(u.user_id))

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    if (tab !== 'following') return
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        filtered.forEach((u) => next.delete(u.user_id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((u) => next.add(u.user_id))
      return next
    })
  }

  function switchTab(next: Tab) {
    setTab(next)
    setQuery('')
    setSelected(new Set())
  }

  const isLoading = tab === 'following' ? followingLoading : followersLoading
  const pageLimitHit = activeItems.length >= PAGE_SIZE

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-lg lg:max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          to="/profile"
          className="text-muted hover:text-secondary transition-colors"
          aria-label="Back to profile"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="t-page-title">
          Manage Follows
        </h1>
      </div>

      <div className="flex border-b border-subtle">
        {([
          { id: 'following', label: `Following${following.length ? ` (${following.length})` : ''}` },
          { id: 'followers', label: `Followers${followers.length ? ` (${followers.length})` : ''}` },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`px-4 py-2 text-[11px] tracking-widest uppercase transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-[var(--brass)] text-[var(--brass)]'
                : 'border-transparent text-muted hover:text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab}…`}
          className="w-full bg-surface border border-subtle rounded pl-9 pr-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 placeholder-muted"
        />
      </div>

      {tab === 'following' && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={toggleSelectAllVisible}
            className="flex items-center gap-2 t-section-title hover:text-secondary transition-colors"
          >
            {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button
            onClick={() => setConfirmBulk(true)}
            disabled={selected.size === 0 || bulkUnfollowMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--brass)]/20"
          >
            <UserMinus size={12} />
            Unfollow{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted text-center py-8 tracking-wide">
          {activeItems.length === 0
            ? tab === 'following'
              ? "You're not following anyone yet."
              : 'No followers yet.'
            : 'No matches.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const isSelected = selected.has(item.user_id)
            return (
              <li
                key={item.user_id}
                className="flex items-center gap-3 p-3 bg-surface border border-subtle rounded-lg"
              >
                {tab === 'following' && (
                  <button
                    onClick={() => toggleSelected(item.user_id)}
                    className="text-muted hover:text-[var(--brass)] transition-colors"
                    aria-label={isSelected ? 'Deselect' : 'Select'}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? (
                      <CheckSquare size={18} className="text-[var(--brass)]" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                )}
                <Link
                  to="/users/$id"
                  params={{ id: item.user_id }}
                  className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <img
                    src={item.avatar_url || identiconDataUri(item.user_id || item.display_name || '')}
                    alt={item.display_name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                  <span className="text-sm text-secondary truncate">
                    {item.display_name}
                  </span>
                </Link>
                {tab === 'following' && (
                  <button
                    onClick={() => setConfirmSingle(item)}
                    disabled={unfollowMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserMinus size={11} />
                    Unfollow
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {pageLimitHit && (
        <p className="text-[11px] text-muted text-center">
          Showing the {PAGE_SIZE} most recent. Use search to narrow down.
        </p>
      )}

      <ConfirmDialog
        open={!!confirmSingle}
        title="Unfollow user?"
        message={
          confirmSingle
            ? `Are you sure you want to unfollow ${confirmSingle.display_name}?`
            : ''
        }
        confirmLabel="Unfollow"
        onConfirm={() => {
          if (confirmSingle) unfollowMutation.mutate(confirmSingle.user_id)
          setConfirmSingle(null)
        }}
        onCancel={() => setConfirmSingle(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title={`Unfollow ${selected.size} ${selected.size === 1 ? 'user' : 'users'}?`}
        message={
          selectedItems.length <= 5
            ? `This will unfollow: ${selectedItems.map((u) => u.display_name).join(', ')}.`
            : `This will unfollow ${selected.size} users, including ${selectedItems
                .slice(0, 3)
                .map((u) => u.display_name)
                .join(', ')}, and ${selected.size - 3} more.`
        }
        confirmLabel="Unfollow all"
        onConfirm={() => {
          bulkUnfollowMutation.mutate(Array.from(selected))
          setConfirmBulk(false)
        }}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  )
}
