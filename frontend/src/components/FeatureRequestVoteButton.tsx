import { useState } from 'react'
import { ArrowBigUp } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { featureRequestsApi } from '../api/featureRequests'
import { toast } from '../store/toast'

interface FeatureRequestVoteButtonProps {
  featureRequestID: string
  initialVoted: boolean
  initialCount: number
  onChanged?: (voted: boolean, count: number) => void
}

export function FeatureRequestVoteButton({ featureRequestID, initialVoted, initialCount, onChanged }: FeatureRequestVoteButtonProps) {
  const [voted, setVoted] = useState(initialVoted)
  const [count, setCount] = useState(initialCount)
  const queryClient = useQueryClient()

  const voteMutation = useMutation({
    mutationFn: (nextVoted: boolean) => featureRequestsApi.vote(featureRequestID, nextVoted),
    onMutate: (nextVoted: boolean) => {
      const delta = nextVoted ? 1 : -1
      setVoted(nextVoted)
      setCount(c => c + delta)
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

  return (
    <button
      type="button"
      onClick={toggleVote}
      disabled={voteMutation.isPending}
      aria-pressed={voted}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${voted ? 'border-[var(--brass)] text-[var(--brass)] bg-[var(--brass)]/10' : 'border-subtle text-muted hover:text-secondary'}`}
    >
      <ArrowBigUp size={15} className={voted ? 'fill-[var(--brass)]' : ''} />
      <span className="font-medium">{count}</span>
    </button>
  )
}
