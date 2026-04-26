import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { MessageSquare } from 'lucide-react'
import { ApiError } from '../api/client'
import { featureRequestsApi } from '../api/featureRequests'
import { FeatureRequestVoteButton } from '../components/FeatureRequestVoteButton'
import { useAuthStore } from '../store/auth'
import { formatDateTime, useRegionalPrefs } from '../utils/date'

export default function FeatureRequestDetail() {
  const { id } = useParams({ from: '/app/feature-requests/$id' })
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [commentBody, setCommentBody] = useState('')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const featureQuery = useQuery({
    queryKey: ['feature-request', id],
    queryFn: () => featureRequestsApi.get(id),
  })

  const commentsQuery = useQuery({
    queryKey: ['feature-request', id, 'comments'],
    queryFn: () => featureRequestsApi.listComments(id),
  })

  const addCommentMutation = useMutation({
    mutationFn: () => featureRequestsApi.createComment(id, commentBody.trim()),
    onSuccess: () => {
      setCommentBody('')
      setSubmitMessage('Comment posted.')
      queryClient.invalidateQueries({ queryKey: ['feature-request', id, 'comments'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to post comment.'
      setSubmitMessage(msg)
    },
  })

  function onSubmitComment(e: FormEvent) {
    e.preventDefault()
    setSubmitMessage(null)
    if (!commentBody.trim()) {
      setSubmitMessage('Comment cannot be empty.')
      return
    }
    addCommentMutation.mutate()
  }

  const feature = featureQuery.data
  const comments = commentsQuery.data?.items ?? []

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="t-page-title">Feature request</h1>
        <Link to="/feature-requests" className="text-sm text-[var(--brass)] hover:underline">Back to board</Link>
      </div>

      {featureQuery.isLoading && <p className="text-sm text-muted">Loading feature request…</p>}
      {featureQuery.isError && <p role="alert" className="text-sm text-[var(--error-text)]">Failed to load feature request.</p>}

      {feature && (
        <>
          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="t-subsection-title">{feature.title}</h2>
                <p className="text-xs text-muted mt-1">
                  Status: {feature.status} · Scope: {feature.scope_type} · Updated {formatDateTime(feature.updated_at, prefs)}
                </p>
              </div>
              <FeatureRequestVoteButton
                featureRequestID={feature.id}
                initialVoted={feature.viewer_has_voted}
                initialCount={feature.vote_count}
              />
            </div>
            {feature.refined_description ? (
              <p className="text-sm text-secondary whitespace-pre-wrap">{feature.refined_description}</p>
            ) : (
              <p className="text-sm text-muted italic">No refined description yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-subtle bg-surface p-4 md:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-muted" />
              <h3 className="t-subsection-title">Discussion</h3>
              <span className="text-xs text-muted">({comments.length})</span>
            </div>

            <div className="space-y-2">
              {commentsQuery.isLoading && <p className="text-sm text-muted">Loading comments…</p>}
              {!commentsQuery.isLoading && comments.length === 0 && (
                <p className="text-sm text-muted">Be the first to leave a comment.</p>
              )}
              {comments.map((c) => (
                <article key={c.id} className="rounded-lg border border-subtle p-3 space-y-1">
                  <p className="text-xs text-muted">
                    <Link to="/users/$id" params={{ id: c.user_id }} className="font-medium text-primary hover:underline">
                      {c.display_name}
                    </Link>{' '}
                    · {formatDateTime(c.created_at, prefs)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                </article>
              ))}
            </div>

            {currentUser ? (
              <form onSubmit={onSubmitComment} className="space-y-2">
                <label htmlFor="feature-request-comment" className="sr-only">Comment</label>
                <textarea
                  id="feature-request-comment"
                  className="min-h-24 w-full rounded-md border border-subtle bg-transparent p-2 text-sm focus:outline-none focus:border-[var(--brass)]/50"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Share feedback, a use case, or a clarifying question…"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-md bg-[var(--brass)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={addCommentMutation.isPending}
                  >
                    {addCommentMutation.isPending ? 'Posting…' : 'Post comment'}
                  </button>
                  {submitMessage && <p className="text-xs text-muted">{submitMessage}</p>}
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted">Log in to join the discussion.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
