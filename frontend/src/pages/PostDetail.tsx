import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { postApi } from '../api/posts'
import { PostCard } from '../components/PostCard'
import { useSmartBack } from '../hooks/useSmartBack'

export default function PostDetail() {
  const { id } = useParams({ from: '/app/posts/$id' })
  const goBack = useSmartBack('/feed')

  const { data: post, isLoading, isError, error } = useQuery({
    queryKey: ['posts', id],
    queryFn: () => postApi.get(id),
  })

  const notFound = isError && (error as { status?: number } | null)?.status === 404

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 t-section-title">
        <button
          onClick={goBack}
          className="hover:text-secondary inline-flex items-center gap-1"
          aria-label="Go back"
        >
          <ChevronLeft size={13} /> Back
        </button>
      </div>

      {isLoading && (
        <div className="h-40 rounded border border-subtle bg-surface animate-pulse" />
      )}

      {notFound && (
        <p className="text-sm text-muted py-6 text-center">Post not found or no longer visible.</p>
      )}

      {isError && !notFound && (
        <p role="alert" className="text-[var(--error-text)] text-sm">Failed to load post.</p>
      )}

      {post && <PostCard post={post} />}
    </div>
  )
}
