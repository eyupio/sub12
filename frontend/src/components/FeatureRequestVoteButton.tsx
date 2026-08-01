import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { featureRequestsApi } from '../api/featureRequests'
import { toast } from '../store/toast'

interface FeatureRequestVoteButtonProps {
  featureRequestID: string
  initialVoted: boolean
  initialCount: number
  /** `sm` is the inline chip; `lg` is the tall tile the board and detail lead with. */
  size?: 'sm' | 'lg'
  onChanged?: (voted: boolean, count: number) => void
}

export function FeatureRequestVoteButton({
  featureRequestID,
  initialVoted,
  initialCount,
  size = 'sm',
  onChanged,
}: FeatureRequestVoteButtonProps) {
  const [voted, setVoted] = useState(initialVoted)
  const [count, setCount] = useState(initialCount)
  const [bump, setBump] = useState(false)
  const queryClient = useQueryClient()

  // A refetch (new sort, new scope, someone else's vote) can hand this button a
  // different truth than the one it optimistically rendered.
  useEffect(() => { setVoted(initialVoted) }, [initialVoted])
  useEffect(() => { setCount(initialCount) }, [initialCount])

  const voteMutation = useMutation({
    mutationFn: (nextVoted: boolean) => featureRequestsApi.vote(featureRequestID, nextVoted),
    onMutate: (nextVoted: boolean) => {
      const delta = nextVoted ? 1 : -1
      setVoted(nextVoted)
      setCount(c => c + delta)
      setBump(true)
      onChanged?.(nextVoted, count + delta)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-request', featureRequestID] })
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] })
    },
    onError: (err: unknown, nextVoted) => {
      const delta = nextVoted ? -1 : 1
      setVoted(!nextVoted)
      setCount(c => c + delta)
      onChanged?.(!nextVoted, count + delta)
      const msg = err instanceof ApiError ? err.message : 'Failed to update vote.'
      toast(msg, 'error')
    },
  })

  const toggleVote = () => {
    if (voteMutation.isPending) return
    voteMutation.mutate(!voted)
  }

  const label = `${voted ? 'Remove your upvote' : 'Upvote'} — ${count} ${count === 1 ? 'vote' : 'votes'}`

  if (size === 'lg') {
    return (
      <button
        type="button"
        onClick={toggleVote}
        disabled={voteMutation.isPending}
        aria-pressed={voted}
        aria-label={label}
        title={label}
        className={`u-press flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border py-2 transition-colors ${
          voted
            ? 'border-gold bg-gold-tint text-gold shadow-gold'
            : 'border-subtle text-muted hover:border-gold hover:text-gold'
        }`}
      >
        <ChevronUp size={18} strokeWidth={2.5} aria-hidden="true" />
        <span
          className={`u-tnum text-base font-bold leading-none ${bump ? 'animate-pop' : ''}`}
          onAnimationEnd={() => setBump(false)}
        >
          {count}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-70">
          {count === 1 ? 'vote' : 'votes'}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleVote}
      disabled={voteMutation.isPending}
      aria-pressed={voted}
      aria-label={label}
      title={label}
      className={`u-press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        voted ? 'border-gold bg-gold-tint text-gold' : 'border-subtle text-muted hover:border-gold hover:text-gold'
      }`}
    >
      <ChevronUp size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="u-tnum font-semibold">{count}</span>
    </button>
  )
}
