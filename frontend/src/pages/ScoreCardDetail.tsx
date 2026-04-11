import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X as XIcon, CheckCircle, XCircle, AlertCircle, UserCheck, Edit3 } from 'lucide-react'
import { scoreCardApi } from '../api/scoreCards'
import { leagueApi, ScoreConfirmation, ScoreCardAction } from '../api/leagues'
import { useAuthStore } from '../store/auth'

function VerificationBadge({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--success-text)] text-[11px] tracking-widest uppercase">
        <CheckCircle size={12} /> Verified
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--error-text)] text-[11px] tracking-widest uppercase">
        <XCircle size={12} /> Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] tracking-widest uppercase">
      <AlertCircle size={12} /> Pending
    </span>
  )
}

function AuditTrailSection({ scoreCardId, cardOwnerID }: { scoreCardId: string; cardOwnerID: string }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [showAmend, setShowAmend] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [amendScore, setAmendScore] = useState('')
  const [amendX, setAmendX] = useState('')
  const [amendReason, setAmendReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [confirmLeagueId, setConfirmLeagueId] = useState('')
  const [actionLeagueId, setActionLeagueId] = useState('')

  const { data: auditTrail } = useQuery({
    queryKey: ['score-cards', scoreCardId, 'audit-trail'],
    queryFn: () => leagueApi.getAuditTrail(scoreCardId),
  })

  const confirmMutation = useMutation({
    mutationFn: () => leagueApi.confirmScore(scoreCardId, confirmLeagueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'audit-trail'] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
    },
  })

  const amendMutation = useMutation({
    mutationFn: () =>
      leagueApi.amendScore(scoreCardId, actionLeagueId, {
        new_total_score: Number(amendScore),
        new_x_count: Number(amendX),
        reason: amendReason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'audit-trail'] })
      setShowAmend(false)
      setAmendScore('')
      setAmendX('')
      setAmendReason('')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => leagueApi.rejectScore(scoreCardId, actionLeagueId, rejectReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'audit-trail'] })
      setShowReject(false)
      setRejectReason('')
    },
  })

  const confirmations = auditTrail?.confirmations ?? []
  const actions = auditTrail?.actions ?? []
  const isOwnScore = currentUser?.id === cardOwnerID

  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'

  return (
    <div className="space-y-4 border-t border-subtle pt-4">
      <h3 className="text-[11px] tracking-widest uppercase text-muted">Verification Audit Trail</h3>

      {/* Confirmations */}
      {confirmations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] tracking-widest uppercase text-muted">Confirmations</p>
          {confirmations.map((conf: ScoreConfirmation) => (
            <div key={conf.id} className="flex items-center gap-2 text-sm">
              <UserCheck size={13} className="text-[var(--success-text)]" />
              <span className="text-secondary">{conf.display_name}</span>
              <span className="text-muted text-[11px] font-mono ml-auto">
                {new Date(conf.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Admin actions */}
      {actions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] tracking-widest uppercase text-muted">Admin Actions</p>
          {actions.map((action: ScoreCardAction) => (
            <div key={action.id} className="bg-surface rounded p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                {action.action === 'amend' ? (
                  <Edit3 size={13} className="text-amber-600 dark:text-amber-400" />
                ) : (
                  <XCircle size={13} className="text-[var(--error-text)]" />
                )}
                <span className="text-sm text-secondary">
                  {action.display_name} — <span className="uppercase text-[11px]">{action.action}</span>
                </span>
                <span className="text-muted text-[11px] font-mono ml-auto">
                  {new Date(action.created_at).toLocaleDateString()}
                </span>
              </div>
              {action.action === 'amend' && action.old_total_score != null && (
                <p className="text-xs text-muted pl-5">
                  Score: {action.old_total_score} &rarr; {action.new_total_score}
                  {action.old_x_count != null && (
                    <span className="ml-2">X: {action.old_x_count} &rarr; {action.new_x_count}</span>
                  )}
                </p>
              )}
              {action.reason && (
                <p className="text-xs text-secondary pl-5 italic">{action.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmations.length === 0 && actions.length === 0 && (
        <p className="text-muted text-xs">No verification activity yet.</p>
      )}

      {/* Confirm button (for non-owners) */}
      {!isOwnScore && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmLeagueId}
              onChange={e => setConfirmLeagueId(e.target.value)}
              placeholder="League ID to confirm for"
              className={inputCls}
            />
            <button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || !confirmLeagueId.trim()}
              className="shrink-0 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-3 rounded transition-colors"
            >
              {confirmMutation.isPending ? '...' : 'Confirm'}
            </button>
          </div>
          {confirmMutation.isError && (
            <p className="text-[var(--error-text)] text-xs">
              {(confirmMutation.error as Error).message.includes('403')
                ? 'Cannot confirm your own score or not a member.'
                : (confirmMutation.error as Error).message.includes('409')
                ? 'Already confirmed.'
                : 'Failed to confirm.'}
            </p>
          )}
        </div>
      )}

      {/* Admin actions: Amend / Reject */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowAmend(!showAmend); setShowReject(false) }}
          className="text-[11px] tracking-widest uppercase border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 px-3 py-1.5 rounded transition-colors"
        >
          Amend
        </button>
        <button
          onClick={() => { setShowReject(!showReject); setShowAmend(false) }}
          className="text-[11px] tracking-widest uppercase border border-red-500/30 text-[var(--error-text)] hover:bg-red-500/10 px-3 py-1.5 rounded transition-colors"
        >
          Reject
        </button>
      </div>

      {showAmend && (
        <div className="space-y-2 bg-surface rounded p-3">
          <input type="text" placeholder="League ID" value={actionLeagueId} onChange={e => setActionLeagueId(e.target.value)} className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="New total score" value={amendScore} onChange={e => setAmendScore(e.target.value)} className={inputCls} />
            <input type="number" placeholder="New X count" value={amendX} onChange={e => setAmendX(e.target.value)} className={inputCls} />
          </div>
          <input type="text" placeholder="Reason (optional)" value={amendReason} onChange={e => setAmendReason(e.target.value)} className={inputCls} />
          <button
            onClick={() => amendMutation.mutate()}
            disabled={amendMutation.isPending || !amendScore || !amendX || !actionLeagueId}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
          >
            {amendMutation.isPending ? 'Amending...' : 'Submit Amendment'}
          </button>
          {amendMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to amend. Not a league admin?</p>}
        </div>
      )}

      {showReject && (
        <div className="space-y-2 bg-surface rounded p-3">
          <input type="text" placeholder="League ID" value={actionLeagueId} onChange={e => setActionLeagueId(e.target.value)} className={inputCls} />
          <textarea
            placeholder="Reason for rejection (required)"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={2}
            className={inputCls + ' resize-none'}
          />
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || !rejectReason.trim() || !actionLeagueId}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
          >
            {rejectMutation.isPending ? 'Rejecting...' : 'Submit Rejection'}
          </button>
          {rejectMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to reject. Reason required or not admin.</p>}
        </div>
      )}
    </div>
  )
}

export default function ScoreCardDetail() {
  const { id } = useParams({ from: '/app/scores/$id' })
  const [showLightbox, setShowLightbox] = useState(false)

  const { data: card, isLoading, isError } = useQuery({
    queryKey: ['score-cards', id],
    queryFn: () => scoreCardApi.get(id),
  })

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-3 max-w-lg lg:max-w-3xl mx-auto">
        <div className="h-6 w-32 bg-surface rounded animate-pulse" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 25 }).map((_, i) => (
            <div key={i} className="aspect-square bg-surface rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !card) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-[var(--error-text)] text-sm">Card not found.</p>
        <Link to="/scores" className="block mt-4 text-[11px] tracking-widest uppercase text-[var(--brass)]">&larr; Back</Link>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/scores" className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg lg:text-xl font-medium tracking-widest uppercase text-secondary">{card.shot_at}</h1>
          {card.location && <p className="text-xs text-muted tracking-wide">{card.location}</p>}
        </div>
      </div>

      {/* Desktop: two-column layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Left column: score grid + totals */}
        <div className="space-y-6">
          {/* Score grid */}
          <div className="grid grid-cols-5 gap-2 lg:gap-3">
            {card.shot_scores.map((score, i) => {
              const isX = score === 10 && card.shot_xs[i]
              return (
                <div
                  key={i}
                  className={[
                    'aspect-square rounded border font-mono font-medium flex items-center justify-center',
                    isX
                      ? 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]'
                      : score === 10
                      ? 'bg-[var(--brass)]/10 border-[var(--brass)]/40 text-[var(--brass)]'
                      : score > 0
                      ? 'bg-surface-hover border-strong text-secondary'
                      : 'bg-surface border-subtle text-muted',
                  ].join(' ')}
                >
                  <span className={isX ? 'text-xl font-bold' : score === 10 ? 'text-base' : 'text-lg'}>
                    {isX ? 'X' : score}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="flex gap-8 font-mono border-t border-subtle pt-4">
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">Total</p>
              <p className="text-3xl font-semibold text-primary">{card.total_score}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">X Count</p>
              <p className="text-3xl font-semibold text-[var(--brass)]">{card.x_count}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-widest uppercase text-muted">Avg</p>
              <p className="text-3xl font-semibold text-secondary">
                {(card.total_score / 25).toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* Right column: metadata + photo */}
        <div className="space-y-4 mt-6 lg:mt-0">
          {/* Metadata */}
          <div className="space-y-2 text-sm border-t lg:border-t-0 border-subtle pt-4 lg:pt-0">
            {card.wind_mph != null && (
              <div className="flex justify-between">
                <span className="text-muted tracking-widest uppercase text-[11px]">Wind</span>
                <span className="font-mono text-secondary">{card.wind_mph} mph</span>
              </div>
            )}
            {card.temp_celsius != null && (
              <div className="flex justify-between">
                <span className="text-muted tracking-widest uppercase text-[11px]">Temp</span>
                <span className="font-mono text-secondary">{card.temp_celsius}&deg;C</span>
              </div>
            )}
            {card.notes && (
              <div className="pt-1">
                <p className="text-[11px] tracking-widest uppercase text-muted mb-1">Notes</p>
                <p className="text-secondary text-sm leading-relaxed">{card.notes}</p>
              </div>
            )}
            <div className="flex justify-between pt-1">
              <span className="text-muted tracking-widest uppercase text-[11px]">Verification</span>
              <VerificationBadge status={card.verification} />
            </div>
          </div>

          {/* Score card photo */}
          {card.card_image_url && (
            <div className="pt-4 border-t border-subtle">
              <p className="text-[11px] tracking-widest uppercase text-muted mb-2">Score Card Photo</p>
              <button onClick={() => setShowLightbox(true)} className="w-full">
                <img
                  src={card.card_image_url}
                  alt="Score card photo"
                  className="rounded border border-subtle max-h-64 w-full object-contain bg-surface cursor-zoom-in"
                  loading="lazy"
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit Trail */}
      <AuditTrailSection scoreCardId={id} cardOwnerID={card.user_id} />

      {/* Lightbox */}
      {showLightbox && card.card_image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute top-2 right-2 bg-page/80 backdrop-blur rounded-full p-2 text-muted hover:text-primary transition-colors z-10"
              aria-label="Close"
            >
              <XIcon size={20} />
            </button>
            <img
              src={card.card_image_url}
              alt="Score card photo"
              className="max-h-[85vh] max-w-full object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  )
}
