import { useState } from 'react'
import { Heart } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { likeApi } from '../api/likes'

type LikeTarget = 'score_card' | 'comment' | 'post' | 'activity'

interface LikeButtonProps {
  targetId: string
  targetType: LikeTarget
  initialLiked: boolean
  initialCount: number
  size?: number
}

function getLikeFn(targetType: LikeTarget) {
  switch (targetType) {
    case 'score_card': return { like: likeApi.likeScoreCard, unlike: likeApi.unlikeScoreCard }
    case 'comment': return { like: likeApi.likeComment, unlike: likeApi.unlikeComment }
    case 'post': return { like: likeApi.likePost, unlike: likeApi.unlikePost }
    case 'activity': return { like: likeApi.likeActivity, unlike: likeApi.unlikeActivity }
  }
}

export function LikeButton({ targetId, targetType, initialLiked, initialCount, size = 18 }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const fns = getLikeFn(targetType)

  const likeMutation = useMutation({
    mutationFn: () => fns.like(targetId),
    onMutate: () => {
      setLiked(true)
      setCount(c => c + 1)
    },
    onError: () => {
      setLiked(false)
      setCount(c => c - 1)
    },
  })

  const unlikeMutation = useMutation({
    mutationFn: () => fns.unlike(targetId),
    onMutate: () => {
      setLiked(false)
      setCount(c => c - 1)
    },
    onError: () => {
      setLiked(true)
      setCount(c => c + 1)
    },
  })

  const pending = likeMutation.isPending || unlikeMutation.isPending

  function toggle() {
    if (pending) return
    if (liked) {
      unlikeMutation.mutate()
    } else {
      likeMutation.mutate()
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={liked ? 'Unlike' : 'Like'}
    >
      <Heart
        size={size}
        className={liked ? 'fill-red-500 text-red-500' : 'text-muted hover:text-red-400'}
      />
      {count > 0 && (
        <span className={liked ? 'text-red-500 font-medium' : 'text-muted'}>{count}</span>
      )}
    </button>
  )
}
