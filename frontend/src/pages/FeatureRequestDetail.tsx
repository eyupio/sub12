import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  Building2,
  Clock,
  Flag,
  MessageSquare,
  Sparkles,
  Trophy,
  UserCog,
} from 'lucide-react'
import { ApiError } from '../api/client'
import { featureRequestsApi, type FeatureRequestEvent, type FeatureRequestStatus } from '../api/featureRequests'
import { FeatureRequestVoteButton } from '../components/FeatureRequestVoteButton'
import { Skeleton, SkeletonText } from '../components/Skeleton'
import { MetaChip, PriorityPill, StatusPill } from '../components/featureBoard'
import { useAuthStore } from '../store/auth'
import { formatDateTime, formatRelativeTime, useRegionalPrefs } from '../utils/date'
import {
  FEATURE_STAGES,
  PRIORITY_LABELS,
  ROADMAP_STAGES,
  STATUS_LABELS,
  stageForStatus,
} from '../utils/featureBoard'

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

  const eventsQuery = useQuery({
    queryKey: ['feature-request', id, 'events'],
    queryFn: () => featureRequestsApi.events(id),
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
  const events = eventsQuery.data?.items ?? []

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:pb-20 space-y-4">
      <Link to="/feature-requests" className="u-nudge inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold">
        <ArrowLeft size={14} aria-hidden="true" />
        Feature board
      </Link>

      {featureQuery.isLoading && (
        <div className="surface-card p-5 space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={3} />
        </div>
      )}

      {featureQuery.isError && (
        <div className="surface-card p-6 text-center">
          <p role="alert" className="text-sm text-[var(--error-text)]">This idea couldn't be loaded.</p>
          <p className="mt-1 text-sm text-muted">
            League and club ideas are visible to their members only.
          </p>
          <Link to="/feature-requests" className="btn btn-secondary mt-4">Back to the board</Link>
        </div>
      )}

      {feature && (
        <>
          <section className="surface-card p-4 md:p-6 animate-fade-in-up">
            <div className="flex items-start gap-4">
              <FeatureRequestVoteButton
                featureRequestID={feature.id}
                initialVoted={feature.viewer_has_voted}
                initialCount={feature.vote_count}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <h1 className="t-page-title !text-xl leading-snug">{feature.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusPill status={feature.status} />
                  <PriorityPill priority={feature.priority} />
                  {feature.scope_type !== 'platform' && feature.scope_name && (
                    <MetaChip icon={feature.scope_type === 'league' ? Trophy : Building2}>{feature.scope_name}</MetaChip>
                  )}
                  {feature.owner_admin_name && <MetaChip icon={UserCog}>{feature.owner_admin_name}</MetaChip>}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Suggested by{' '}
                  <Link to="/users/$id" params={{ id: feature.requester_id }} className="text-secondary hover:text-gold">
                    {feature.requester_name}
                  </Link>{' '}
                  · {formatRelativeTime(feature.created_at, prefs)}
                </p>
              </div>
            </div>

            <StageProgress status={feature.status} />

            <div className="mt-4">
              {feature.refined_description ? (
                <p className="whitespace-pre-wrap text-sm text-secondary">{feature.refined_description}</p>
              ) : (
                <p className="text-sm text-muted italic">
                  This idea hasn't been written up yet — an admin will refine it before it goes to a wider vote.
                </p>
              )}
            </div>
          </section>

          {/* ── History ─────────────────────────────────────────────────── */}
          <section className="surface-card p-4 md:p-6">
            <h2 className="t-subsection-title flex items-center gap-2">
              <Clock size={15} className="text-gold" aria-hidden="true" />
              History
            </h2>
            {eventsQuery.isLoading && <SkeletonText lines={3} className="mt-3" />}
            {!eventsQuery.isLoading && events.length === 0 && (
              <p className="mt-2 text-sm text-muted">No changes recorded yet.</p>
            )}
            {events.length > 0 && (
              <ol className="mt-3 space-y-0">
                {events.map((event, index) => (
                  <HistoryRow key={event.id} event={event} last={index === events.length - 1} prefs={prefs} />
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted">
              Updated {formatDateTime(feature.updated_at, prefs)}
            </p>
          </section>

          {/* ── Discussion ──────────────────────────────────────────────── */}
          <section className="surface-card p-4 md:p-6 space-y-3">
            <h2 className="t-subsection-title flex items-center gap-2">
              <MessageSquare size={15} className="text-gold" aria-hidden="true" />
              Discussion
              <span className="text-xs font-normal text-muted">({comments.length})</span>
            </h2>

            <div className="space-y-2">
              {commentsQuery.isLoading && <SkeletonText lines={2} />}
              {!commentsQuery.isLoading && comments.length === 0 && (
                <p className="text-sm text-muted">
                  No comments yet. A concrete example of how you'd use this is the most useful thing you can add.
                </p>
              )}
              {comments.map((c) => (
                <article key={c.id} className="rounded-[var(--radius)] border border-subtle p-3">
                  <p className="text-xs text-muted">
                    <Link to="/users/$id" params={{ id: c.user_id }} className="font-medium text-primary hover:text-gold">
                      {c.display_name}
                    </Link>{' '}
                    · {formatRelativeTime(c.created_at, prefs)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{c.body}</p>
                </article>
              ))}
            </div>

            {currentUser ? (
              <form onSubmit={onSubmitComment} className="space-y-2">
                <label htmlFor="feature-request-comment" className="sr-only">Comment</label>
                <textarea
                  id="feature-request-comment"
                  className="field min-h-24"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Share feedback, a use case, or a clarifying question…"
                />
                <div className="flex items-center gap-3">
                  <button type="submit" className="btn btn-primary" disabled={addCommentMutation.isPending}>
                    {addCommentMutation.isPending ? 'Posting…' : 'Post comment'}
                  </button>
                  {submitMessage && <p className="text-xs text-muted">{submitMessage}</p>}
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted">Sign in to join the discussion.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/**
 * Where the idea sits on its journey. Rejected requests leave the track, so
 * they get a plain statement instead of a half-filled progress bar.
 */
function StageProgress({ status }: { status: FeatureRequestStatus }) {
  const current = stageForStatus(status)
  if (current.key === 'declined') {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-[var(--radius)] border border-subtle bg-surface-2 px-3 py-2 text-xs text-muted">
        <Flag size={13} style={{ color: current.color }} aria-hidden="true" />
        Not planned — the reasoning is in the discussion below.
      </p>
    )
  }
  const currentIndex = ROADMAP_STAGES.findIndex(stage => stage.key === current.key)
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
      {ROADMAP_STAGES.map((stage, index) => {
        const reached = index <= currentIndex
        return (
          <li key={stage.key} className="min-w-0">
            <span
              className="block h-1 rounded-full transition-colors"
              style={{ backgroundColor: reached ? stage.color : 'var(--line)' }}
              aria-hidden="true"
            />
            <span
              className={`mt-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.08em] ${reached ? '' : 'text-muted opacity-60'}`}
              style={reached ? { color: stage.color } : undefined}
            >
              {stage.label}
            </span>
            {index === currentIndex && <span className="sr-only">(current stage)</span>}
          </li>
        )
      })}
    </ol>
  )
}

function HistoryRow({ event, last, prefs }: { event: FeatureRequestEvent; last: boolean; prefs: ReturnType<typeof useRegionalPrefs> }) {
  const { icon: Icon, color, text } = describeEvent(event)
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
          style={{
            color,
            borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
        >
          <Icon size={12} aria-hidden="true" />
        </span>
        {!last && <span className="my-1 w-px flex-1 bg-[var(--line)]" aria-hidden="true" />}
      </div>
      <div className={last ? 'pb-0' : 'pb-4'}>
        <p className="text-sm text-secondary">{text}</p>
        <p className="text-xs text-muted">
          {event.actor_name ? `${event.actor_name} · ` : ''}{formatDateTime(event.created_at, prefs)}
        </p>
      </div>
    </li>
  )
}

function describeEvent(event: FeatureRequestEvent) {
  const statusLabel = (value?: string) =>
    value && value in STATUS_LABELS ? STATUS_LABELS[value as FeatureRequestStatus] : value ?? 'unknown'

  switch (event.event_type) {
    case 'status_changed': {
      const stage = event.to_value && event.to_value in STATUS_LABELS
        ? stageForStatus(event.to_value as FeatureRequestStatus)
        : FEATURE_STAGES[0]
      return {
        icon: stage.icon,
        color: stage.color,
        text: `Moved from ${statusLabel(event.from_value)} to ${statusLabel(event.to_value)}`,
      }
    }
    case 'priority_changed':
      return {
        icon: Flag,
        color: 'var(--gold)',
        text: `Priority set to ${PRIORITY_LABELS[event.to_value as keyof typeof PRIORITY_LABELS] ?? event.to_value}`,
      }
    case 'owner_changed':
      return { icon: UserCog, color: 'var(--gold)', text: 'Owner reassigned' }
    default:
      return { icon: Sparkles, color: 'var(--gold)', text: 'Added to the feature board' }
  }
}
