import { useState, useRef } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, X as XIcon, CheckCircle, XCircle, AlertCircle, UserCheck, Edit3, Pencil, Camera, Upload, MessageSquare, Send, Trash2, CornerDownRight, Share2, RotateCcw, RotateCw, Trophy } from 'lucide-react'
import { scoreCardApi, commentApi, Comment } from '../api/scoreCards'
import { gearApi } from '../api/gear'
import { leagueApi, ScoreConfirmation, ScoreCardAction } from '../api/leagues'
import { communityReviewApi } from '../api/communityReview'
import { clubsApi } from '../api/clubs'
import { usersApi } from '../api/users'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FlagDialog } from '../components/FlagDialog'
import { ImageEditor } from '../components/ImageEditor'
import { LikeButton } from '../components/LikeButton'
import { LocationField, type LocationValue } from '../components/LocationField'
import { useSmartBack } from '../hooks/useSmartBack'
import { Tooltip } from '../components/Tooltip'
import { tips } from '../components/tooltips'
import { ShareDialog } from '../components/ShareDialog'
import { ReportDialog } from '../components/ReportDialog'
import { Flag } from 'lucide-react'
import { formatDate, useRegionalPrefs } from '../utils/date'
import { UserAvatar } from '../components/UserAvatar'
import { LocationMapThumbnail } from '../components/LocationMapThumbnail'

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
  const prefs = useRegionalPrefs()
  const [showAmend, setShowAmend] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [amendScore, setAmendScore] = useState('')
  const [amendX, setAmendX] = useState('')
  const [amendReason, setAmendReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // Auto-resolve league from score card
  const { data: league } = useQuery({
    queryKey: ['score-cards', scoreCardId, 'league'],
    queryFn: () => leagueApi.getLeagueForScoreCard(scoreCardId),
  })

  // Check if current user is a league member / admin
  const { data: members } = useQuery({
    queryKey: ['leagues', league?.id ?? '', 'members'],
    queryFn: () => leagueApi.listMembers(league!.id),
    enabled: !!league?.id,
  })

  const { data: auditTrail } = useQuery({
    queryKey: ['score-cards', scoreCardId, 'audit-trail'],
    queryFn: () => leagueApi.getAuditTrail(scoreCardId),
  })

  const confirmMutation = useMutation({
    mutationFn: () => leagueApi.confirmScore(scoreCardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'audit-trail'] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
      toast('Score confirmed', 'success')
    },
    onError: (err) => {
      toast(err instanceof ApiError && err.status === 409 ? 'Already confirmed' : 'Failed to confirm score', 'error')
    },
  })

  const amendMutation = useMutation({
    mutationFn: () =>
      leagueApi.amendScore(scoreCardId, {
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
      toast('Score amended', 'success')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => leagueApi.rejectScore(scoreCardId, rejectReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'audit-trail'] })
      setShowReject(false)
      setRejectReason('')
      toast('Score rejected', 'success')
    },
  })

  const confirmations = auditTrail?.confirmations ?? []
  const actions = auditTrail?.actions ?? []
  const isOwnScore = currentUser?.id === cardOwnerID
  const currentMember = members?.items?.find(m => m.user_id === currentUser?.id)
  const isMember = !!currentMember
  const isAdmin = currentMember?.is_admin ?? false

  const inputCls = 'w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)]/50 transition-colors'

  return (
    <div className="space-y-4 border-t border-subtle pt-4">
      <div className="flex items-center justify-between">
        <h3 className="t-section-title">Verification Audit Trail</h3>
        {league && (
          <Link
            to="/leagues/$id"
            params={{ id: league.id }}
            className="text-[11px] tracking-widest uppercase text-[var(--brass)] hover:opacity-80 transition-opacity"
          >
            {league.name}
          </Link>
        )}
      </div>

      {confirmations.length > 0 && (
        <div className="space-y-1.5">
          <p className="t-section-title">Confirmations</p>
          {confirmations.map((conf: ScoreConfirmation) => (
            <div key={conf.id} className="flex items-center gap-2 text-sm">
              <UserCheck size={13} className="text-[var(--success-text)]" />
              <span className="text-secondary">{conf.display_name}</span>
              <span className="text-muted text-[11px] font-mono ml-auto">
                {formatDate(conf.created_at, prefs)}
              </span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="space-y-1.5">
          <p className="t-section-title">Admin Actions</p>
          {actions.map((action: ScoreCardAction) => (
            <div key={action.id} className="bg-surface rounded p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                {action.action === 'amend' ? (
                  <Edit3 size={13} className="text-amber-600 dark:text-amber-400" />
                ) : (
                  <XCircle size={13} className="text-[var(--error-text)]" />
                )}
                <span className="text-sm text-secondary">
                  {action.display_name} \u2014 <span className="uppercase text-[11px]">{action.action}</span>
                </span>
                <span className="text-muted text-[11px] font-mono ml-auto">
                  {formatDate(action.created_at, prefs)}
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

      {/* Confirm button — visible to league members who don't own the score */}
      {!isOwnScore && isMember && (
        <div className="space-y-2">
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="bg-[var(--success-text)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
          >
            {confirmMutation.isPending ? 'Confirming…' : 'Confirm Score'}
          </button>
          {confirmMutation.isError && (
            <p className="text-[var(--error-text)] text-xs">
              {confirmMutation.error instanceof ApiError && confirmMutation.error.status === 409
                ? 'Already confirmed.'
                : 'Failed to confirm.'}
            </p>
          )}
        </div>
      )}

      {/* Amend/Reject buttons — visible only to league admins */}
      {isAdmin && (
        <>
          <div className="flex gap-2">
            <Tooltip content={tips.scoreAmend}>
              <button
                onClick={() => { setShowAmend(!showAmend); setShowReject(false) }}
                className="text-[11px] tracking-widest uppercase border border-amber-600/30 dark:border-amber-400/30 text-amber-600 dark:text-amber-400 hover:bg-amber-600/10 dark:hover:bg-amber-400/10 px-3 py-1.5 rounded transition-colors"
              >
                Amend
              </button>
            </Tooltip>
            <Tooltip content={tips.scoreReject}>
              <button
                onClick={() => { setShowReject(!showReject); setShowAmend(false) }}
                className="text-[11px] tracking-widest uppercase border border-[var(--error-text)]/30 text-[var(--error-text)] hover:bg-[var(--error-text)]/10 px-3 py-1.5 rounded transition-colors"
              >
                Reject
              </button>
            </Tooltip>
          </div>

          {showAmend && (
            <div className="space-y-2 bg-surface rounded p-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="New total score" value={amendScore} onChange={e => setAmendScore(e.target.value)} className={inputCls} />
                <input type="number" placeholder="New X count" value={amendX} onChange={e => setAmendX(e.target.value)} className={inputCls} />
              </div>
              <input type="text" placeholder="Reason (optional)" value={amendReason} onChange={e => setAmendReason(e.target.value)} className={inputCls} />
              <button
                onClick={() => amendMutation.mutate()}
                disabled={amendMutation.isPending || !amendScore || !amendX}
                className="bg-amber-600 dark:bg-amber-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
              >
                {amendMutation.isPending ? 'Amending…' : 'Submit Amendment'}
              </button>
              {amendMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to amend score.</p>}
            </div>
          )}

          {showReject && (
            <div className="space-y-2 bg-surface rounded p-3">
              <textarea
                placeholder="Reason for rejection (required)"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={2}
                className={inputCls + ' resize-none'}
              />
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="bg-[var(--error-text)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Submit Rejection'}
              </button>
              {rejectMutation.isError && <p className="text-[var(--error-text)] text-xs">Failed to reject. Reason required.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

type Shot = { score: number; x: boolean }

function EditScoreGrid({ shots, onUpdate }: { shots: Shot[]; onUpdate: (shots: Shot[]) => void }) {
  const [selected, setSelected] = useState<number | null>(null)

  function handleScoreButton(val: number | 'X') {
    if (selected === null) return
    const next = [...shots]
    if (val === 'X') {
      next[selected] = { score: 10, x: true }
    } else {
      next[selected] = { score: val, x: false }
    }
    onUpdate(next)
    if (selected < 24) setSelected(selected + 1)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {shots.map(({ score, x }, i) => {
          const isSelected = selected === i
          const label = score === 10 && x ? 'X' : score === 0 ? String(i + 1) : String(score)
          return (
            <button
              key={i}
              onClick={() => setSelected(isSelected ? null : i)}
              className={[
                'aspect-square rounded font-mono font-semibold transition-all select-none flex items-center justify-center text-sm',
                isSelected ? 'border-2 border-[var(--brass)] ring-2 ring-[var(--brass)]/30 scale-[1.05] z-10' : 'border border-subtle',
                !isSelected && score === 0 && 'bg-surface text-muted',
                !isSelected && score === 10 && x && 'bg-[var(--brass)]/15 border-[var(--brass)]/50 text-[var(--brass)]',
                !isSelected && score === 10 && !x && 'bg-[var(--brass)]/10 border-[var(--brass)]/40 text-[var(--brass)]',
                !isSelected && score > 0 && score < 10 && 'bg-surface-hover border-strong text-secondary',
              ].filter(Boolean).join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>
      {selected !== null && (
        <div className="space-y-2 bg-surface border border-subtle rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="t-section-title">Shot {selected + 1}</span>
            <button onClick={() => setSelected(null)} className="t-section-title hover:text-secondary">Done</button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {([0,1,2,3,4,5,6,7,8,9,10,'X'] as const).map(val => {
              const { score, x: xFlag } = shots[selected]
              const isActive = val === 'X' ? score === 10 && xFlag : score === (val as number) && !(val === 10 && xFlag)
              return (
                <button key={val} onClick={() => handleScoreButton(val as number | 'X')} className={[
                  'py-2 rounded font-mono text-xs font-semibold transition-colors',
                  isActive ? 'bg-[var(--brass)] text-inverse' : val === 'X' ? 'bg-[var(--brass)]/10 text-[var(--brass)]' : 'bg-surface-hover text-secondary hover:bg-surface-active',
                ].join(' ')}>
                  {val}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CommentReplies({ commentId, cardId, communityName }: { commentId: string; cardId: string; communityName?: string }) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [reportTargetId, setReportTargetId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const prefs = useRegionalPrefs()

  const { data } = useQuery({
    queryKey: ['comments', commentId, 'replies'],
    queryFn: () => commentApi.listReplies(commentId),
  })

  const replyMutation = useMutation({
    mutationFn: () => commentApi.reply(commentId, replyBody.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', commentId, 'replies'] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
      setReplyBody('')
    },
  })

  const updateReplyMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => commentApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', commentId, 'replies'] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
      setEditingId(null)
    },
    onError: () => toast('Failed to save reply', 'error'),
  })

  const deleteReplyMutation = useMutation({
    mutationFn: (id: string) => commentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', commentId, 'replies'] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
    },
    onError: () => toast('Failed to delete reply', 'error'),
  })

  const replies: Comment[] = data?.items ?? []

  return (
    <div className="ml-8 mt-2 space-y-2 border-l-2 border-subtle pl-3">
      {replies.map((r) => {
        const isOwnReply = currentUser?.id === r.user_id
        return (
        <div key={r.id} className="flex gap-2">
          <UserAvatar
            user={{ id: r.user_id, display_name: r.display_name, avatar_url: r.avatar_url }}
            size={24}
            className="shrink-0"
            linkToProfile
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[11px] font-medium text-secondary">{r.display_name}</span>
              <span className="text-[10px] text-muted">
                {formatDate(r.created_at, prefs)}
                {new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 5000 && (
                  <span className="ml-1 italic">(edited)</span>
                )}
              </span>
            </div>
            {editingId === r.id ? (
              <div className="space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={2}
                  className="w-full bg-surface border border-subtle rounded px-2 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none"
                  aria-label="Edit reply body"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateReplyMutation.mutate({ id: r.id, body: editBody.trim() })}
                    disabled={updateReplyMutation.isPending || !editBody.trim()}
                    className="px-2 py-0.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[10px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateReplyMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-0.5 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-secondary leading-relaxed">{r.body}</p>
                <div className="flex gap-1 flex-shrink-0">
                  {isOwnReply && (
                    <>
                      <button
                        onClick={() => { setEditingId(r.id); setEditBody(r.body) }}
                        className="p-1 text-muted hover:text-secondary transition-colors"
                        aria-label="Edit reply"
                        title="Edit reply"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        disabled={deleteReplyMutation.isPending}
                        className="p-1 text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Delete reply"
                        title="Delete reply"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                  {!isOwnReply && currentUser && (
                    <button
                      onClick={() => setReportTargetId(r.id)}
                      className="p-1 text-muted hover:text-[var(--error-text)] transition-colors"
                      aria-label="Report reply"
                      title="Report inappropriate reply"
                    >
                      <AlertTriangle size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )
      })}

      {currentUser && (
        <div className="flex gap-2 pt-1">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Reply… (⌘/Ctrl + Enter to post)"
            aria-label="Reply body"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyBody.trim()) {
                e.preventDefault()
                replyMutation.mutate()
              }
            }}
            className="flex-1 bg-surface border border-subtle rounded px-2 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
          <button
            onClick={() => replyMutation.mutate()}
            disabled={replyMutation.isPending || !replyBody.trim()}
            className="p-1.5 rounded border border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
            aria-label="Post reply"
          >
            <Send size={12} />
          </button>
        </div>
      )}

      <ReportDialog
        open={reportTargetId !== null}
        targetType="comment"
        targetId={reportTargetId ?? ''}
        onClose={() => setReportTargetId(null)}
        communityName={communityName}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete reply?"
        message="This reply will be permanently removed."
        onConfirm={() => {
          if (confirmDeleteId) deleteReplyMutation.mutate(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

function CommentsSection({ cardId, canModerate, communityName }: { cardId: string; canModerate: boolean; communityName?: string }) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [newBody, setNewBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const prefs = useRegionalPrefs()
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null)
  const [reportTargetId, setReportTargetId] = useState<string | null>(null)

  const flagMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => commentApi.flag(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
    },
  })

  const unflagMutation = useMutation({
    mutationFn: (id: string) => commentApi.unflag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
      toast('Flag cleared', 'success')
    },
    onError: () => toast('Failed to clear flag', 'error'),
  })

  const { data } = useQuery({
    queryKey: ['score-cards', cardId, 'comments'],
    queryFn: () => scoreCardApi.listComments(cardId),
  })

  const createMutation = useMutation({
    mutationFn: () => scoreCardApi.createComment(cardId, newBody.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
      setNewBody('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      scoreCardApi.updateComment(cardId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scoreCardApi.deleteComment(cardId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', cardId, 'comments'] })
    },
  })

  const comments: Comment[] = data?.items ?? []

  function startEdit(c: Comment) {
    setEditingId(c.id)
    setEditBody(c.body)
  }

  function toggleReplies(id: string) {
    setExpandedReplies(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="pt-6 border-t border-subtle space-y-4">
      <h2 className="t-section-title flex items-center gap-2">
        <MessageSquare size={13} />
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {comments.length === 0 && (
        <p className="text-sm text-muted">No comments yet — be the first.</p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id}>
            <div className="flex gap-3">
              {/* Avatar */}
              <UserAvatar
                user={{ id: c.user_id, display_name: c.display_name, avatar_url: c.avatar_url }}
                size={32}
                className="shrink-0"
                linkToProfile
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-medium text-secondary">{c.display_name}</span>
                  <span className="text-[10px] text-muted">
                    {formatDate(c.created_at, prefs)}
                    {new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 5000 && (
                      <span className="ml-1 italic">(edited)</span>
                    )}
                  </span>
                </div>

                {editingId === c.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={2}
                      className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateMutation.mutate({ id: c.id, body: editBody.trim() })}
                        disabled={updateMutation.isPending || !editBody.trim()}
                        className="px-2.5 py-1 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updateMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 rounded border border-subtle t-section-title hover:text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.is_flagged && (
                      <div className="mb-1 px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]">
                        {currentUser?.id === c.user_id ? (
                          <>A moderator flagged this comment — please reflect and edit to amend. Your edit clears the flag.</>
                        ) : (
                          <>Flagged by a moderator — pending amendment.</>
                        )}
                        {c.flag_reason && (
                          <span className="block text-[10px] text-muted mt-0.5">Reason: {c.flag_reason}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-secondary leading-relaxed">{c.body}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        {currentUser?.id === c.user_id && (
                          <>
                            <button
                              onClick={() => startEdit(c)}
                              className="p-1 text-muted hover:text-secondary transition-colors"
                              aria-label="Edit comment"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(c.id)}
                              disabled={deleteMutation.isPending}
                              className="p-1 text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Delete comment"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                        {canModerate && currentUser?.id !== c.user_id && (
                          c.is_flagged ? (
                            <button
                              onClick={() => unflagMutation.mutate(c.id)}
                              disabled={unflagMutation.isPending}
                              className="p-1 text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Clear flag"
                              title="Clear flag"
                            >
                              <Flag size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => setFlagTargetId(c.id)}
                              className="p-1 text-muted hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                              aria-label="Flag for amendment"
                              title="Flag for amendment"
                            >
                              <Flag size={12} />
                            </button>
                          )
                        )}
                        {currentUser && currentUser.id !== c.user_id && (
                          <button
                            onClick={() => setReportTargetId(c.id)}
                            className="p-1 text-muted hover:text-[var(--error-text)] transition-colors"
                            aria-label="Report comment"
                            title="Report inappropriate comment"
                          >
                            <AlertTriangle size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Comment actions: like + reply toggle */}
                    <div className="flex items-center gap-3 mt-1">
                      <LikeButton targetId={c.id} targetType="comment" initialLiked={c.is_liked} initialCount={c.like_count} size={14} />
                      <button
                        onClick={() => toggleReplies(c.id)}
                        className="flex items-center gap-1 text-[11px] text-muted hover:text-secondary transition-colors"
                      >
                        <CornerDownRight size={12} />
                        {c.reply_count > 0 ? `${c.reply_count} ${c.reply_count === 1 ? 'reply' : 'replies'}` : 'Reply'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Threaded replies */}
            {expandedReplies.has(c.id) && (
              <CommentReplies commentId={c.id} cardId={cardId} communityName={communityName} />
            )}
          </div>
        ))}
      </div>

      {/* New comment input */}
      <div className="flex gap-3 pt-2">
        <UserAvatar
          user={currentUser ?? {}}
          size={32}
          className="shrink-0"
          showHoverCard={false}
        />
        <div className="flex-1 flex gap-2">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Add a comment… (⌘/Ctrl + Enter to post)"
            aria-label="Comment body"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && newBody.trim()) {
                e.preventDefault()
                createMutation.mutate()
              }
            }}
            className="flex-1 bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !newBody.trim()}
            className="p-2 rounded border border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
            aria-label="Post comment"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete comment?"
        message="This comment will be permanently removed."
        onConfirm={() => {
          if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <FlagDialog
        open={flagTargetId !== null}
        targetLabel="comment"
        onClose={() => setFlagTargetId(null)}
        onSubmit={async (reason) => {
          if (flagTargetId) await flagMutation.mutateAsync({ id: flagTargetId, reason })
        }}
      />

      <ReportDialog
        open={reportTargetId !== null}
        targetType="comment"
        targetId={reportTargetId ?? ''}
        onClose={() => setReportTargetId(null)}
        communityName={communityName}
      />
    </div>
  )
}

function CommunityReviewSection({ scoreCardId, isOwner }: { scoreCardId: string; isOwner: boolean }) {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()
  const { data, isLoading } = useQuery({
    queryKey: ['score-cards', scoreCardId, 'community-review'],
    queryFn: () => communityReviewApi.get(scoreCardId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId, 'community-review'] })
    queryClient.invalidateQueries({ queryKey: ['score-cards', scoreCardId] })
  }

  const requestMutation = useMutation({
    mutationFn: () => communityReviewApi.request(scoreCardId),
    onSuccess: () => {
      invalidate()
      toast('Community review requested', 'success')
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : 0
      toast(status === 409 ? 'A review request is already open' : 'Failed to request review', 'error')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => communityReviewApi.cancel(scoreCardId),
    onSuccess: () => {
      invalidate()
      toast('Review request cancelled', 'success')
    },
    onError: () => toast('Failed to cancel review request', 'error'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => communityReviewApi.confirm(scoreCardId),
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

  if (isLoading) return null
  const req = data?.request
  const count = data?.confirmation_count ?? 0
  const required = req?.required_confirmations ?? 0

  return (
    <div className="border-t border-subtle pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[11px] tracking-widest uppercase text-muted">Community Review</h3>
        {req?.status === 'open' && (
          <span className="text-[11px] tracking-widest uppercase text-amber-600 dark:text-amber-400">
            {count}/{required} confirmations
          </span>
        )}
        {req?.status === 'verified' && (
          <span className="inline-flex items-center gap-1 text-[var(--success-text)] text-[11px] tracking-widest uppercase">
            <CheckCircle size={12} /> Verified by community
          </span>
        )}
      </div>

      {!req && isOwner && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Open this card up for community review. Reviewers can confirm your score; once 3 reviewers confirm,
            the card auto-flips to verified.
          </p>
          <button
            onClick={() => requestMutation.mutate()}
            disabled={requestMutation.isPending}
            className="self-start px-3 py-1.5 text-sm rounded border border-subtle bg-surface-hover hover:bg-[var(--brass)] hover:text-black transition-colors disabled:opacity-50"
          >
            {requestMutation.isPending ? 'Requesting…' : 'Request community review'}
          </button>
        </div>
      )}

      {req?.status === 'open' && isOwner && (
        <button
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="px-3 py-1.5 text-sm rounded border border-subtle hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {cancelMutation.isPending ? 'Cancelling…' : 'Cancel review request'}
        </button>
      )}

      {req?.status === 'open' && !isOwner && (
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending || data?.viewer_has_confirmed}
          className="px-3 py-1.5 text-sm rounded border border-subtle bg-surface-hover hover:bg-[var(--brass)] hover:text-black transition-colors disabled:opacity-50"
        >
          {data?.viewer_has_confirmed ? 'You confirmed this card' : confirmMutation.isPending ? 'Confirming…' : 'Confirm this card'}
        </button>
      )}

      {data && data.confirmations.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {data.confirmations.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm text-muted">
              <UserCheck size={14} className="text-[var(--success-text)]" />
              <span>
                <span className="text-[var(--text)]">{c.display_name}</span> confirmed on {formatDate(c.created_at, prefs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ScoreCardDetail() {
  const { id } = useParams({ from: '/app/scores/$id' })
  const smartBack = useSmartBack('/scores', ['/leagues/', '/clubs/', '/feed', '/profile', '/scores'])
  const [showLightbox, setShowLightbox] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editShots, setEditShots] = useState<Shot[]>([])
  const [editMeta, setEditMeta] = useState({ shot_at: '', location: '', notes: '', rifle_id: '', pellet_id: '', distance_m: '', discipline: '' })
  const [editLocation, setEditLocation] = useState<LocationValue>({ label: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showSubmitLeague, setShowSubmitLeague] = useState(false)
  const [submitLeagueRoundId, setSubmitLeagueRoundId] = useState('')
  const [editingFile, setEditingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)

  const { data: card, isLoading, isError } = useQuery({
    queryKey: ['score-cards', id],
    queryFn: () => scoreCardApi.get(id),
  })

  // Resolve league info for league-submitted cards
  const { data: cardLeague } = useQuery({
    queryKey: ['score-cards', id, 'league'],
    queryFn: () => leagueApi.getLeagueForScoreCard(id),
    enabled: !!card?.league_round_id,
  })

  const notOwnCard = !!card && !!currentUser && card.user_id !== currentUser.id
  const { data: cardAuthor } = useQuery({
    queryKey: ['user-profile', card?.user_id],
    queryFn: () => usersApi.getProfile(card!.user_id),
    enabled: notOwnCard,
  })

  // Moderation: a user can moderate comments on this card if they are a
  // global admin, an admin of the card's league, or an admin of the card's
  // club. Fetch league members + club info for the card when present.
  const { data: cardLeagueMembers } = useQuery({
    queryKey: ['leagues', cardLeague?.id, 'members'],
    queryFn: () => leagueApi.listMembers(cardLeague!.id),
    enabled: !!cardLeague?.id && !!currentUser,
  })
  const { data: cardClub } = useQuery({
    queryKey: ['clubs', card?.club_id],
    queryFn: () => clubsApi.get(card!.club_id!),
    enabled: !!card?.club_id && !!currentUser,
  })
  const isCardLeagueAdmin = !!cardLeagueMembers?.items?.find(
    (m) => m.user_id === currentUser?.id && m.is_admin,
  )
  const isCardClubAdmin = !!cardClub?.is_admin
  const isGlobalAdmin = currentUser?.role === 'admin'
  const canModerateComments = isGlobalAdmin || isCardLeagueAdmin || isCardClubAdmin

  // Always fetch (with all=true so inactive gear still resolves) when viewing
  // an own card with rifle/pellet IDs, so the EQUIPMENT sidebar can render
  // without a separate fetch. Fallback handles cross-user cards too — for
  // viewers, the lookup fails silently and the sidebar falls back to "—".
  const isOwner = !!currentUser && !!card && currentUser.id === card.user_id
  const needsGear = (isOwner && (!!card?.rifle_id || !!card?.pellet_id)) || editing
  const { data: rifleData } = useQuery({ queryKey: ['rifles', 'all'], queryFn: () => gearApi.listRifles(true), enabled: needsGear })
  const { data: pelletData } = useQuery({ queryKey: ['pellets', 'all'], queryFn: () => gearApi.listPellets(true), enabled: needsGear })

  // Audit trail surfaces verifier identity + timestamp for the LEAGUE sidebar.
  const { data: cardAuditTrail } = useQuery({
    queryKey: ['score-cards', id, 'audit-trail'],
    queryFn: () => leagueApi.getAuditTrail(id),
    enabled: !!card?.league_round_id,
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const distanceParsed = editMeta.distance_m.trim() === '' ? undefined : Number(editMeta.distance_m)
      const updated = await scoreCardApi.update(id, {
        shot_at: editMeta.shot_at,
        shot_scores: editShots.map(s => s.score),
        shot_xs: editShots.map(s => s.x),
        location: editLocation.label || undefined,
        location_lat: editLocation.lat,
        location_lng: editLocation.lng,
        notes: editMeta.notes || undefined,
        rifle_id: editMeta.rifle_id || undefined,
        pellet_id: editMeta.pellet_id || undefined,
        distance_m: Number.isFinite(distanceParsed) ? (distanceParsed as number) : undefined,
        discipline: editMeta.discipline.trim() ? editMeta.discipline.trim() : undefined,
      })
      if (imageFile) {
        await scoreCardApi.uploadImage(id, imageFile)
      }
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', id] })
      queryClient.invalidateQueries({ queryKey: ['score-cards', id, 'audit-trail'] })
      clearImage()
      setEditing(false)
      toast('Score card updated', 'success')
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        toast('This card is locked — the league admin has disabled edits after verification.', 'error')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => scoreCardApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (cardLeague?.id) {
        queryClient.invalidateQueries({ queryKey: ['leagues', cardLeague.id] })
        queryClient.invalidateQueries({ queryKey: ['leagues', cardLeague.id, 'standings'] })
      }
      toast('Score card deleted', 'success')
      smartBack()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        toast('This card is locked — the league admin has disabled edits after verification.', 'error')
      } else {
        toast('Failed to delete score card', 'error')
      }
    },
  })

  const rotateMutation = useMutation({
    mutationFn: (rotation: number) =>
      scoreCardApi.update(id, { card_image_rotation: rotation } as Parameters<typeof scoreCardApi.update>[1]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['score-cards', id] }),
    onError: () => toast('Failed to rotate image', 'error'),
  })

  const submitToLeagueMutation = useMutation({
    mutationFn: (roundId: string) => scoreCardApi.submitToLeague(id, roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['score-cards', id] })
      setShowSubmitLeague(false)
      setSubmitLeagueRoundId('')
      toast('Score card submitted to league', 'success')
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Failed to submit to league', 'error')
      }
    },
  })

  function handleRotate(dir: 'cw' | 'ccw') {
    const current = card?.card_image_rotation ?? 0
    const next = dir === 'cw' ? ((current + 90) % 360) : ((current - 90 + 360) % 360)
    rotateMutation.mutate(next)
  }

  function handleImageSelect(file: File | undefined) {
    if (!file) return
    setEditingFile(file)
  }

  function onEdited(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast('Image must be under 10 MB', 'error')
      return
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setEditingFile(null)
  }

  function startEditPending() {
    if (imageFile) setEditingFile(imageFile)
  }

  async function startEditExistingCardImage(url: string) {
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const blob = await res.blob()
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const f = new File([blob], `score-card.${ext}`, { type: blob.type || 'image/jpeg' })
      setEditingFile(f)
    } catch {
      toast('Could not load the current photo to edit.', 'error')
    }
  }

  function clearImage() {
    setImageFile(null)
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
    }
  }

  function startEdit() {
    if (!card) return
    clearImage()
    setEditShots(card.shot_scores.map((score, i) => ({ score, x: card.shot_xs[i] })))
    setEditMeta({
      shot_at: card.shot_at,
      location: card.location ?? '',
      notes: card.notes ?? '',
      rifle_id: card.rifle_id ?? '',
      pellet_id: card.pellet_id ?? '',
      distance_m: card.distance_m != null ? String(card.distance_m) : '',
      discipline: card.discipline ?? '',
    })
    setEditLocation({
      label: card.location ?? '',
      lat: card.location_lat ?? undefined,
      lng: card.location_lng ?? undefined,
    })
    setEditing(true)
  }

  const editTotalScore = editShots.reduce((a, s) => a + s.score, 0)
  const editXCount = editShots.filter(s => s.x).length

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

  // Resolve full rifle / pellet objects when available for the EQUIPMENT card.
  const rifle = card.rifle_id ? rifleData?.items?.find(r => r.id === card.rifle_id) : undefined
  const pellet = card.pellet_id ? pelletData?.items?.find(p => p.id === card.pellet_id) : undefined

  // Pull the latest "verified" event from the audit trail (the most recent peer
  // confirmation when the card is verified). Confirmations come back oldest-first,
  // so picking the last entry is correct.
  const verifierConfirmation = card.verification === 'verified'
    ? cardAuditTrail?.confirmations?.[cardAuditTrail.confirmations.length - 1]
    : undefined

  const avg = card.total_score / 25
  const runningAvgDelta = card.running_avg != null ? avg - card.running_avg : null

  // Pretty date: keep YYYY-MM-DD intact for tests/i18n elsewhere; render as DD/MM/YYYY.
  const dateParts = card.shot_at.split('-')
  const prettyDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : card.shot_at
  const createdTime = new Date(card.created_at).toTimeString().slice(0, 5)

  return (
    <div className="p-4 lg:p-8 space-y-5 lg:space-y-6 max-w-6xl mx-auto pb-24">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={smartBack}
          aria-label="Back to cards"
          className="flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors"
        >
          <ChevronLeft size={16} /> Back to cards
        </button>
        {isOwner && !editing && (
          <div className="flex items-center gap-2">
            <button onClick={startEdit} className="flex items-center gap-1.5 t-section-title hover:text-[var(--brass)] border border-subtle hover:border-[var(--brass)]/40 rounded px-3 py-1.5 transition-colors">
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 t-section-title hover:text-[var(--brass)] border border-subtle hover:border-[var(--brass)]/40 rounded px-3 py-1.5 transition-colors"
            >
              <Share2 size={13} /> Share to Feed
            </button>
            {!card.is_draft && !card.league_round_id && (
              <button
                onClick={() => setShowSubmitLeague(true)}
                className="flex items-center gap-1.5 t-section-title hover:text-[var(--brass)] border border-subtle hover:border-[var(--brass)]/40 rounded px-3 py-1.5 transition-colors"
              >
                <Trophy size={13} /> Submit to League
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 t-section-title hover:text-[var(--error-text)] border border-subtle hover:border-[var(--error-text)]/40 rounded px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete score card"
            >
              <XIcon size={13} /> Delete
            </button>
          </div>
        )}
      </div>

      {/* Personal Best banner */}
      {!editing && card.is_pb && card.pb_delta != null && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--brass)]/40 bg-[var(--brass)]/10 px-4 py-2.5">
          <span className="text-[var(--brass)] text-base">🏆</span>
          <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] font-medium">Personal Best</span>
          <span className="t-section-title">·</span>
          <span className="text-xs text-secondary">improved by +{card.pb_delta} over previous</span>
        </div>
      )}

      {cardAuthor?.is_blocked && (
        <div className="rounded-lg border border-[var(--error-text)]/30 bg-[var(--error-text)]/5 px-4 py-3 text-xs tracking-wide text-[var(--error-text)]">
          You have blocked this user. Unblock them from their profile to restore interactions.
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-4 border border-amber-500/30 rounded-lg p-4 bg-amber-500/5">
          {card.league_round_id && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs tracking-widest uppercase">
              <AlertCircle size={14} /> Editing will reset verification to pending
            </div>
          )}

          <EditScoreGrid shots={editShots} onUpdate={setEditShots} />

          <div className="flex gap-8 font-mono border-t border-subtle pt-3">
            <span className="text-muted text-[11px] tracking-widest uppercase">Total <strong className="text-primary ml-2 text-base">{editTotalScore}</strong></span>
            <span className="text-muted text-[11px] tracking-widest uppercase">X <strong className="text-[var(--brass)] ml-2 text-base">{editXCount}</strong></span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block t-section-title mb-1">Date</label>
              <input type="date" value={editMeta.shot_at} onChange={e => setEditMeta(m => ({ ...m, shot_at: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary font-mono focus:outline-none focus:border-[var(--brass)]/50" />
            </div>
            <div>
              <label className="block t-section-title mb-1">Location</label>
              <LocationField
                value={editLocation}
                onChange={setEditLocation}
                inputClassName="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
              />
            </div>
            <div>
              <label className="block t-section-title mb-1">Distance (m)</label>
              <input type="number" min={0} value={editMeta.distance_m} onChange={e => setEditMeta(m => ({ ...m, distance_m: e.target.value }))} placeholder="e.g. 25" className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary font-mono placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50" />
            </div>
            <div>
              <label className="block t-section-title mb-1">Discipline</label>
              <input type="text" value={editMeta.discipline} onChange={e => setEditMeta(m => ({ ...m, discipline: e.target.value }))} placeholder="e.g. Benchrest" className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50" />
            </div>
          </div>

          {(rifleData?.items ?? []).length > 0 && (
            <div>
              <label className="block t-section-title mb-1">Rifle</label>
              <select value={editMeta.rifle_id} onChange={e => setEditMeta(m => ({ ...m, rifle_id: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50">
                <option value="">-- none --</option>
                {(rifleData?.items ?? []).map(r => <option key={r.id} value={r.id}>{r.make} {r.model}</option>)}
              </select>
            </div>
          )}

          {(pelletData?.items ?? []).length > 0 && (
            <div>
              <label className="block t-section-title mb-1">Pellet</label>
              <select value={editMeta.pellet_id} onChange={e => setEditMeta(m => ({ ...m, pellet_id: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50">
                <option value="">-- none --</option>
                {(pelletData?.items ?? []).map(p => <option key={p.id} value={p.id}>{p.brand} {p.model}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block t-section-title mb-1">Notes</label>
            <textarea value={editMeta.notes} onChange={e => setEditMeta(m => ({ ...m, notes: e.target.value }))} rows={2} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted resize-none focus:outline-none focus:border-[var(--brass)]/50" />
          </div>

          {/* Photo upload / replace */}
          <div>
            <label className="block t-section-title mb-1">Score Card Photo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="New score card photo" className="rounded border border-subtle max-h-48 w-full object-contain bg-surface" />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-page/80 backdrop-blur rounded-full p-1 text-muted hover:text-primary transition-colors"
                  aria-label="Remove new photo"
                >
                  <XIcon size={16} />
                </button>
                {imageFile && (
                  <button
                    type="button"
                    onClick={startEditPending}
                    className="absolute bottom-2 right-2 px-3 py-1 rounded-full bg-black/60 text-white text-[11px] tracking-wide"
                  >
                    Edit
                  </button>
                )}
              </div>
            ) : card.card_image_url ? (
              <div className="space-y-2">
                <img src={card.card_image_url} alt="Current score card photo" className="rounded border border-subtle max-h-48 w-full object-contain bg-surface opacity-60" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-2.5 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                  >
                    <Upload size={16} />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-2.5 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                  >
                    <Camera size={16} />
                    Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => card.card_image_url && startEditExistingCardImage(card.card_image_url)}
                    className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-2.5 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                >
                  <Upload size={16} />
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors"
                >
                  <Camera size={16} />
                  Camera
                </button>
              </div>
            )}
          </div>

          {updateMutation.isError && <p className="text-[var(--error-text)] text-sm">Failed to save changes. Please try again.</p>}

          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editMeta.shot_at} className="flex-1 py-2.5 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed">
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="px-4 py-2.5 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Hero + viz + sidebar */}
      {!editing && (
        <>
          {/* Hero */}
          <div className="rounded-lg border border-subtle bg-surface px-5 py-5 lg:px-6 lg:py-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="space-y-3 min-w-0">
                <div className="flex items-baseline gap-3 font-mono">
                  <h1 className="t-page-title">{prettyDate}</h1>
                  <span className="text-base text-muted">{createdTime}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded bg-surface-hover text-muted">
                    {card.league_round_id ? 'League' : 'Personal'}
                  </span>
                  {card.league_round_id && <VerificationBadge status={card.verification} />}
                  {cardLeague && (
                    <Link
                      to="/leagues/$id"
                      params={{ id: cardLeague.id }}
                      className="text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass)]/10 px-2 py-0.5 rounded hover:bg-[var(--brass)]/20 transition-colors"
                    >
                      {cardLeague.name}
                    </Link>
                  )}
                  {cardLeague?.round_name && (
                    <span className="text-[10px] tracking-widest uppercase text-muted bg-surface-hover px-2 py-0.5 rounded">
                      {cardLeague.round_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-6 font-mono shrink-0">
                <div className="text-right">
                  <p className="text-4xl lg:text-5xl font-semibold text-primary leading-none">{card.total_score}</p>
                  {runningAvgDelta != null && (
                    <p className={`mt-2 text-xs ${runningAvgDelta >= 0 ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'}`}>
                      {runningAvgDelta >= 0 ? '↑' : '↓'}{Math.abs(runningAvgDelta).toFixed(1)}
                      <span className="text-muted ml-1 normal-case tracking-normal">vs running avg</span>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right">
                  <span className="text-[10px] tracking-widest uppercase text-muted">X</span>
                  <span className="text-xl text-[var(--brass)] font-semibold">{card.x_count}</span>
                  <span className="text-[10px] tracking-widest uppercase text-muted">Avg</span>
                  <span className="text-xl text-secondary font-semibold">{avg.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-3 lg:gap-5 space-y-5 lg:space-y-0">
            {/* Viz panel */}
            <div className="lg:col-span-2 rounded-lg border border-subtle bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-subtle pb-2">
                <span className="text-[11px] tracking-widest uppercase text-[var(--brass)] border-b-2 border-[var(--brass)] pb-1">Shot grid</span>
              </div>
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
                          : score >= 8
                          ? 'bg-surface-hover border-strong text-secondary'
                          : score > 0
                          ? 'bg-surface border-subtle text-muted'
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
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted border-t border-subtle pt-3">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--brass)]" />
                  X-ring hit · <span className="font-mono text-secondary ml-1">{card.x_count}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--brass)]/50" />
                  10–9 ring · <span className="font-mono text-secondary ml-1">{card.shot_scores.filter((s, i) => s >= 9 && !(s === 10 && card.shot_xs[i])).length}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-strong" />
                  8 and below · <span className="font-mono text-secondary ml-1">{card.shot_scores.filter(s => s < 9).length}</span>
                </span>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* EQUIPMENT */}
              {(rifle || pellet || card.distance_m != null || card.discipline) && (
                <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
                  <p className="t-section-title border-b border-subtle pb-2">Equipment</p>
                  {rifle && (
                    <div className="flex justify-between items-start gap-3">
                      <span className="t-section-title">Rifle</span>
                      <div className="text-right">
                        <p className="text-sm text-secondary">{rifle.make} {rifle.model}</p>
                        {(rifle.calibre || rifle.power_ftlb != null) && (
                          <p className="text-[11px] text-muted font-mono">
                            {rifle.calibre || ''}
                            {rifle.calibre && rifle.power_ftlb != null ? ' · ' : ''}
                            {rifle.power_ftlb != null ? `${rifle.power_ftlb} ft-lb` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {pellet && (
                    <div className="flex justify-between items-start gap-3">
                      <span className="t-section-title">Pellet</span>
                      <div className="text-right">
                        <p className="text-sm text-secondary">
                          {pellet.brand} {pellet.model}
                          {pellet.weight_grains != null ? ` ${pellet.weight_grains}gr` : ''}
                        </p>
                        {pellet.batch_code && (
                          <p className="text-[11px] text-muted font-mono">Lot {pellet.batch_code}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {card.distance_m != null && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="t-section-title">Distance</span>
                      <span className="text-sm font-mono text-secondary">{card.distance_m}m</span>
                    </div>
                  )}
                  {card.discipline && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="t-section-title">Discipline</span>
                      <span className="text-sm text-secondary">{card.discipline}</span>
                    </div>
                  )}
                </div>
              )}

              {/* LEAGUE */}
              {cardLeague && (
                <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
                  <p className="t-section-title border-b border-subtle pb-2">League</p>
                  <div className="flex justify-between items-start gap-3">
                    <span className="t-section-title">Name</span>
                    <Link to="/leagues/$id" params={{ id: cardLeague.id }} className="text-sm text-[var(--brass)] hover:opacity-80 text-right">
                      {cardLeague.name}
                    </Link>
                  </div>
                  {cardLeague.round_name && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="t-section-title">Round</span>
                      <span className="text-sm text-secondary">{cardLeague.round_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-3">
                    <span className="t-section-title">Status</span>
                    <VerificationBadge status={card.verification} />
                  </div>
                  {verifierConfirmation && (
                    <div className="flex justify-between items-start gap-3">
                      <span className="t-section-title">Verifier</span>
                      <div className="text-right">
                        <p className="text-sm text-secondary">{verifierConfirmation.display_name}</p>
                        <p className="text-[11px] text-muted font-mono">{verifierConfirmation.created_at.slice(0, 10)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CONDITIONS */}
              {(card.wind_mph != null || card.temp_celsius != null || card.location) && (
                <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2.5">
                  <p className="t-section-title border-b border-subtle pb-2">Conditions</p>
                  {card.wind_mph != null && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="t-section-title">Wind</span>
                      <span className="text-sm font-mono text-secondary">{card.wind_mph === 0 ? 'Calm' : `${card.wind_mph} mph`}</span>
                    </div>
                  )}
                  {card.temp_celsius != null && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="t-section-title">Temp</span>
                      <span className="text-sm font-mono text-secondary">{card.temp_celsius}°C</span>
                    </div>
                  )}
                  {card.location && (
                    typeof card.location_lat === 'number' && typeof card.location_lng === 'number' ? (
                      <div className="space-y-2">
                        <span className="t-section-title">Venue</span>
                        <LocationMapThumbnail
                          label={card.location}
                          lat={card.location_lat}
                          lng={card.location_lng}
                        />
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-3">
                        <span className="t-section-title">Venue</span>
                        <span className="text-sm text-secondary text-right">{card.location}</span>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* NOTES */}
              {card.notes && (
                <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2">
                  <p className="t-section-title border-b border-subtle pb-2">Notes</p>
                  <p className="text-sm text-secondary leading-relaxed border-l-2 border-[var(--brass)]/40 pl-3 italic">
                    "{card.notes}"
                  </p>
                </div>
              )}

              {/* SCORE CARD PHOTO */}
              {card.card_image_url && (
                <div className="rounded-lg border border-subtle bg-surface p-4 space-y-2">
                  <p className="t-section-title border-b border-subtle pb-2">Score Card Photo</p>
                  <button onClick={() => setShowLightbox(true)} className="w-full">
                    <img
                      src={card.card_image_url}
                      alt="Score card photo"
                      className="rounded border border-subtle max-h-48 w-full object-contain bg-surface-hover cursor-zoom-in"
                      loading="lazy"
                      style={{ transform: `rotate(${card.card_image_rotation ?? 0}deg)` }}
                    />
                  </button>
                  {isOwner && !editing && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleRotate('ccw')} title="Rotate left" className="p-1.5 text-gray-400 hover:text-teal-500">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRotate('cw')} title="Rotate right" className="p-1.5 text-gray-400 hover:text-teal-500">
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Audit Trail \u2014 only shown for league cards */}
      {card.league_round_id && (
        <AuditTrailSection scoreCardId={id} cardOwnerID={card.user_id} />
      )}

      {/* Community review \u2014 personal practice cards only */}
      {!card.league_round_id && !card.is_draft && (
        <CommunityReviewSection scoreCardId={id} isOwner={isOwner} />
      )}

      {/* Like / Share */}
      <div className="flex items-center gap-4 border-t border-subtle pt-4">
        <LikeButton
          targetId={id}
          targetType="score_card"
          initialLiked={card.is_liked}
          initialCount={card.like_count}
        />
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <MessageSquare size={18} /> {card.comment_count}
        </span>
        <button
          onClick={() => setShowShare(true)}
          className="text-muted hover:text-[var(--brass)] transition-colors ml-auto"
          aria-label="Share score card"
          title="Share score card"
        >
          <Share2 size={18} />
        </button>
        {card.user_id !== currentUser?.id && (
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-[var(--error-text)] transition-colors"
            aria-label="Report score card"
          >
            <AlertTriangle size={18} />
          </button>
        )}
      </div>

      {showShare && (() => {
        const authorName = cardAuthor?.display_name || currentUser?.display_name || ''
        const score = card.x_count > 0 ? `${card.total_score} (${card.x_count}X)` : String(card.total_score)
        const who = authorName ? `${authorName} shot ` : ''
        const where = card.location ? ` at ${card.location}` : ''
        const shareText = `${who}${score}${where} on sub-12`
        const shareTitle = authorName ? `${authorName} — ${score}` : score
        return (
          <ShareDialog
            targetId={id}
            targetType="score_card"
            targetLabel="Score Card"
            shareTitle={shareTitle}
            shareText={shareText}
            onClose={() => setShowShare(false)}
          />
        )
      })()}

      <ReportDialog
        open={showReport}
        targetType="score_card"
        targetId={id}
        onClose={() => setShowReport(false)}
        communityName={cardLeague?.name ?? cardClub?.name ?? undefined}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete score card?"
        message={card.league_round_id
          ? 'This removes the card, its league submission, comments, and likes. League standings will update accordingly. This cannot be undone.'
          : 'This removes the card, its comments, and likes. This cannot be undone.'}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false)
          deleteMutation.mutate()
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Comments */}
      <CommentsSection
        cardId={id}
        canModerate={canModerateComments}
        communityName={cardLeague?.name ?? cardClub?.name ?? undefined}
      />

      {/* Submit to League modal */}
      {showSubmitLeague && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-teal-500" /> Submit to League
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter the league round ID to submit this score card. You can find the round ID on the league page.
            </p>
            <input
              type="text"
              value={submitLeagueRoundId}
              onChange={e => setSubmitLeagueRoundId(e.target.value)}
              placeholder="League round ID"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowSubmitLeague(false); setSubmitLeagueRoundId('') }}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => submitLeagueRoundId && submitToLeagueMutation.mutate(submitLeagueRoundId)}
                disabled={!submitLeagueRoundId || submitToLeagueMutation.isPending}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {submitToLeagueMutation.isPending ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && card.card_image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4" role="dialog" aria-modal="true" aria-label="Score card photo">
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
              style={{ transform: `rotate(${card.card_image_rotation ?? 0}deg)` }}
            />
          </div>
        </div>
      )}

      {editingFile && (
        <ImageEditor
          file={editingFile}
          onSave={onEdited}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  )
}
