import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle,
  Crosshair,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Users,
} from 'lucide-react'
import { scoreCardApi } from '../api/scoreCards'
import { communityReviewApi } from '../api/communityReview'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ImageModal } from '../components/ImageModal'
import { ScoreCardComments } from '../components/ScoreCardComments'
import { Skeleton, SkeletonText } from '../components/Skeleton'
import { UserAvatar } from '../components/UserAvatar'
import { useSmartBack } from '../hooks/useSmartBack'
import { formatDate, formatRelativeTime, useRegionalPrefs } from '../utils/date'

export default function CommunityReview() {
  const { id } = useParams({ from: '/app/scores/$id/review' })
  const goBack = useSmartBack('/feed', ['/feed', '/scores', '/users/'])
  const prefs = useRegionalPrefs()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [zoom, setZoom] = useState(false)

  const cardQuery = useQuery({
    queryKey: ['score-cards', id],
    queryFn: () => scoreCardApi.get(id),
  })

  const reviewQuery = useQuery({
    queryKey: ['score-cards', id, 'community-review'],
    queryFn: () => communityReviewApi.get(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['score-cards', id, 'community-review'] })
    queryClient.invalidateQueries({ queryKey: ['score-cards', id] })
  }

  const requestMutation = useMutation({
    mutationFn: () => communityReviewApi.request(id),
    onSuccess: () => {
      invalidate()
      toast('Community review requested', 'success')
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast(err.message || 'A review request is already open', 'error')
      } else {
        toast('Failed to request review', 'error')
      }
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => communityReviewApi.cancel(id),
    onSuccess: () => {
      invalidate()
      toast('Review request cancelled', 'success')
    },
    onError: () => toast('Failed to cancel review request', 'error'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => communityReviewApi.confirm(id),
    onSuccess: () => {
      invalidate()
      toast('Card confirmed', 'success')
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : 0
      if (status === 409) toast('Already confirmed', 'error')
      else if (status === 403) toast("Can't confirm your own card", 'error')
      else toast('Failed to confirm card', 'error')
    },
  })

  const card = cardQuery.data
  const review = reviewQuery.data
  const request = review?.request
  const isOwner = !!currentUser && !!card && currentUser.id === card.user_id
  const count = review?.confirmation_count ?? 0
  const required = request?.required_confirmations ?? 0
  const remaining = Math.max(0, required - count)
  const reviewable = !!card && !card.is_draft && !card.league_round_id && card.visibility !== 'private'

  if (cardQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="surface-card p-5 space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <SkeletonText lines={3} />
        </div>
      </div>
    )
  }

  if (cardQuery.isError || !card) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 space-y-4">
        <BackLink onClick={goBack} />
        <div className="surface-card p-6 text-center">
          <p role="alert" className="text-sm text-[var(--error-text)]">This score card couldn't be loaded.</p>
          <p className="mt-1 text-sm text-muted">It may have been deleted, or its owner keeps it private.</p>
          <Link to="/feed" className="btn btn-secondary mt-4">Back to the feed</Link>
        </div>
      </div>
    )
  }

  const author = card.author
  const score = card.total_score
  const progressPct = required > 0 ? Math.min(100, Math.round((count / required) * 100)) : 0

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:pb-20 space-y-4">
      <BackLink onClick={goBack} />

      {/* ── The card under review ───────────────────────────────────────── */}
      <section className="surface-card p-4 md:p-6 animate-fade-in-up">
        <div className="flex items-start gap-4">
          {card.card_image_url ? (
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="shrink-0"
              aria-label="View score card photo"
            >
              <img
                src={card.card_image_url}
                alt="Score card"
                className="w-20 h-20 rounded object-cover cursor-zoom-in"
              />
            </button>
          ) : (
            <div className="shrink-0 w-20 h-20 rounded border border-subtle flex items-center justify-center text-muted">
              <Target size={26} aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="t-page-title !text-xl leading-snug u-tnum">
              {score}
              {card.x_count > 0 && <span className="text-muted text-base ml-1">({card.x_count}X)</span>}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              {author ? (
                <>
                  <UserAvatar
                    user={{ id: author.id, display_name: author.display_name, avatar_url: author.avatar_url }}
                    size={22}
                    linkToProfile
                  />
                  <Link to="/users/$id" params={{ id: author.id }} className="text-sm text-secondary hover:text-gold">
                    {author.display_name}
                  </Link>
                </>
              ) : (
                <span className="text-sm text-secondary">{isOwner ? 'You' : 'A SUB12 shooter'}</span>
              )}
              <span className="text-xs text-muted">· {formatRelativeTime(card.shot_at, prefs)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {card.location && (
                <span className="inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{card.location}</span>
              )}
              {card.distance_m != null && (
                <span className="inline-flex items-center gap-1"><Crosshair size={11} aria-hidden="true" />{card.distance_m}m</span>
              )}
              {card.discipline && <span>{card.discipline}</span>}
            </div>
            <Link to="/scores/$id" params={{ id }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold">
              <Target size={13} aria-hidden="true" />
              View the full score card
            </Link>
          </div>
        </div>
      </section>

      {/* ── Review status ───────────────────────────────────────────────── */}
      <section className="surface-card p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-subsection-title flex items-center gap-2">
            <ShieldCheck size={15} className="text-gold" aria-hidden="true" />
            Community review
          </h2>
          {request?.status === 'open' && (
            <span className="text-[11px] tracking-widest uppercase text-amber-600 dark:text-amber-400 u-tnum">
              {count}/{required} confirmed
            </span>
          )}
          {request?.status === 'verified' && (
            <span className="inline-flex items-center gap-1 text-[var(--success-text)] text-[11px] tracking-widest uppercase">
              <CheckCircle size={12} aria-hidden="true" /> Verified
            </span>
          )}
        </div>

        {reviewQuery.isLoading && <SkeletonText lines={2} />}

        {!reviewQuery.isLoading && !request && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {!isOwner
                ? 'This card isn’t open for community review.'
                : reviewable
                ? 'This card isn’t open for community review yet. Open it up and other shooters can confirm your score.'
                : card.league_round_id
                ? 'League cards are verified by the league, not by community review.'
                : card.is_draft
                ? 'Finish this draft before opening it up for community review.'
                : 'Private cards can’t be reviewed — reviewers have to be able to see the card.'}
            </p>
            {isOwner && reviewable && (
              <button
                type="button"
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending}
                className="btn btn-primary btn-sm"
              >
                <Sparkles size={13} aria-hidden="true" />
                {requestMutation.isPending ? 'Requesting…' : 'Request community review'}
              </button>
            )}
          </div>
        )}

        {request?.status === 'open' && (
          <div className="space-y-3">
            <div>
              <div className="h-1.5 w-full rounded-full bg-surface-hover overflow-hidden" role="presentation">
                <div
                  className="h-full rounded-full bg-[var(--brass)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted">
                {remaining > 0
                  ? `${remaining} more ${remaining === 1 ? 'confirmation' : 'confirmations'} needed before this card is verified.`
                  : 'Enough confirmations gathered — this card is being verified.'}
              </p>
            </div>

            {isOwner ? (
              <button
                type="button"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="btn btn-secondary btn-sm"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel review request'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending || review?.viewer_has_confirmed}
                className="btn btn-primary btn-sm"
              >
                <UserCheck size={13} aria-hidden="true" />
                {review?.viewer_has_confirmed
                  ? 'You confirmed this card'
                  : confirmMutation.isPending
                  ? 'Confirming…'
                  : 'Confirm this card'}
              </button>
            )}
            {isOwner && (
              <p className="text-xs text-muted">
                Cancelling discards the confirmations gathered so far and removes the request from the feed.
              </p>
            )}
          </div>
        )}

        {request?.status === 'verified' && (
          <p className="text-sm text-muted">
            {count} {count === 1 ? 'shooter' : 'shooters'} confirmed this score
            {request.resolved_at ? ` — verified on ${formatDate(request.resolved_at, prefs)}` : ''}.
          </p>
        )}
      </section>

      {/* ── Reviewers ───────────────────────────────────────────────────── */}
      {request && (
        <section className="surface-card p-4 md:p-6 space-y-3">
          <h2 className="t-subsection-title flex items-center gap-2">
            <Users size={15} className="text-gold" aria-hidden="true" />
            Reviewers
            <span className="text-xs font-normal text-muted">({count})</span>
          </h2>

          {count === 0 && (
            <p className="text-sm text-muted">No one has confirmed this card yet.</p>
          )}

          <ul className="space-y-2">
            {(review?.confirmations ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2.5">
                <UserAvatar
                  user={{ id: c.confirmed_by, display_name: c.display_name }}
                  size={28}
                  className="shrink-0"
                  linkToProfile
                />
                <span className="text-sm text-secondary">
                  <Link to="/users/$id" params={{ id: c.confirmed_by }} className="hover:text-gold">
                    {c.display_name}
                  </Link>
                  <span className="text-muted"> confirmed on {formatDate(c.created_at, prefs)}</span>
                </span>
                <UserCheck size={14} className="ml-auto text-[var(--success-text)]" aria-hidden="true" />
              </li>
            ))}
            {request.status === 'open' &&
              Array.from({ length: remaining }, (_, i) => (
                <li key={`pending-${i}`} className="flex items-center gap-2.5 text-sm text-muted">
                  <span
                    className="shrink-0 w-7 h-7 rounded-full border border-dashed border-subtle"
                    aria-hidden="true"
                  />
                  Awaiting a reviewer
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* ── Discussion ──────────────────────────────────────────────────── */}
      <section className="surface-card p-4 md:p-6">
        <ScoreCardComments
          cardId={id}
          canModerate={currentUser?.role === 'admin'}
          className="space-y-4"
        />
      </section>

      {zoom && card.card_image_url && (
        <ImageModal src={card.card_image_url} alt="Score card" onClose={() => setZoom(false)} />
      )}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="u-nudge inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </button>
  )
}
