import { useState, useRef } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X as XIcon, CheckCircle, XCircle, AlertCircle, UserCheck, Edit3, Pencil, Camera, Upload, MessageSquare, Send, Trash2, CornerDownRight, Share2 } from 'lucide-react'
import { scoreCardApi, commentApi, Comment } from '../api/scoreCards'
import { gearApi } from '../api/gear'
import { leagueApi, ScoreConfirmation, ScoreCardAction } from '../api/leagues'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LikeButton } from '../components/LikeButton'
import { ShareDialog } from '../components/ShareDialog'

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
        <h3 className="text-[11px] tracking-widest uppercase text-muted">Verification Audit Trail</h3>
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
                  {action.display_name} \u2014 <span className="uppercase text-[11px]">{action.action}</span>
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

      {/* Confirm button — visible to league members who don't own the score */}
      {!isOwnScore && isMember && (
        <div className="space-y-2">
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
          >
            {confirmMutation.isPending ? 'Confirming...' : 'Confirm Score'}
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
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="New total score" value={amendScore} onChange={e => setAmendScore(e.target.value)} className={inputCls} />
                <input type="number" placeholder="New X count" value={amendX} onChange={e => setAmendX(e.target.value)} className={inputCls} />
              </div>
              <input type="text" placeholder="Reason (optional)" value={amendReason} onChange={e => setAmendReason(e.target.value)} className={inputCls} />
              <button
                onClick={() => amendMutation.mutate()}
                disabled={amendMutation.isPending || !amendScore || !amendX}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
              >
                {amendMutation.isPending ? 'Amending...' : 'Submit Amendment'}
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
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-[11px] tracking-widest uppercase py-2 px-4 rounded transition-colors"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Submit Rejection'}
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
            <span className="text-[11px] tracking-widest uppercase text-muted">Shot {selected + 1}</span>
            <button onClick={() => setSelected(null)} className="text-[11px] tracking-widest uppercase text-muted hover:text-secondary">Done</button>
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

function CommentReplies({ commentId, cardId }: { commentId: string; cardId: string }) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [replyBody, setReplyBody] = useState('')

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

  const replies: Comment[] = data?.items ?? []
  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="ml-8 mt-2 space-y-2 border-l-2 border-subtle pl-3">
      {replies.map((r) => (
        <div key={r.id} className="flex gap-2">
          <div className="w-6 h-6 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[9px] font-medium text-muted">
            {r.avatar_url
              ? <img src={r.avatar_url} alt={r.display_name} className="w-full h-full object-cover" />
              : initials(r.display_name)
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[11px] font-medium text-secondary">{r.display_name}</span>
              <span className="text-[10px] text-muted">
                {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{r.body}</p>
          </div>
        </div>
      ))}

      {currentUser && (
        <div className="flex gap-2 pt-1">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Reply…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && replyBody.trim()) {
                e.preventDefault()
                replyMutation.mutate()
              }
            }}
            className="flex-1 bg-surface border border-subtle rounded px-2 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
          <button
            onClick={() => replyMutation.mutate()}
            disabled={replyMutation.isPending || !replyBody.trim()}
            className="p-1.5 rounded border border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20 transition-colors disabled:opacity-40 self-end"
            aria-label="Post reply"
          >
            <Send size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

function CommentsSection({ cardId }: { cardId: string }) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [newBody, setNewBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="pt-6 border-t border-subtle space-y-4">
      <h2 className="text-[11px] tracking-widest uppercase text-muted flex items-center gap-2">
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
              <div className="w-8 h-8 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
                {c.avatar_url
                  ? <img src={c.avatar_url} alt={c.display_name} className="w-full h-full object-cover" />
                  : initials(c.display_name)
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-medium text-secondary">{c.display_name}</span>
                  <span className="text-[10px] text-muted">
                    {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                        className="px-2.5 py-1 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-40"
                      >
                        {updateMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-secondary leading-relaxed">{c.body}</p>
                      {currentUser?.id === c.user_id && (
                        <div className="flex gap-1 flex-shrink-0">
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
                            className="p-1 text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-40"
                            aria-label="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Comment actions: like + reply toggle */}
                    <div className="flex items-center gap-3 mt-1">
                      <LikeButton targetId={c.id} targetType="comment" initialLiked={false} initialCount={c.like_count} size={14} />
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
              <CommentReplies commentId={c.id} cardId={cardId} />
            )}
          </div>
        ))}
      </div>

      {/* New comment input */}
      <div className="flex gap-3 pt-2">
        <div className="w-8 h-8 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
          {currentUser?.avatar_url
            ? <img src={currentUser.avatar_url} alt={currentUser.display_name} className="w-full h-full object-cover" />
            : initials(currentUser?.display_name ?? '?')
          }
        </div>
        <div className="flex-1 flex gap-2">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && newBody.trim()) {
                e.preventDefault()
                createMutation.mutate()
              }
            }}
            className="flex-1 bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !newBody.trim()}
            className="p-2 rounded border border-[var(--brass)]/30 bg-[var(--brass)]/10 text-[var(--brass)] hover:bg-[var(--brass)]/20 transition-colors disabled:opacity-40 self-end"
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
    </div>
  )
}

export default function ScoreCardDetail() {
  const { id } = useParams({ from: '/app/scores/$id' })
  const [showLightbox, setShowLightbox] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editShots, setEditShots] = useState<Shot[]>([])
  const [editMeta, setEditMeta] = useState({ shot_at: '', location: '', notes: '', rifle_id: '', pellet_id: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
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

  const { data: rifleData } = useQuery({ queryKey: ['rifles'], queryFn: () => gearApi.listRifles(), enabled: editing })
  const { data: pelletData } = useQuery({ queryKey: ['pellets'], queryFn: () => gearApi.listPellets(), enabled: editing })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updated = await scoreCardApi.update(id, {
        shot_at: editMeta.shot_at,
        shot_scores: editShots.map(s => s.score),
        shot_xs: editShots.map(s => s.x),
        location: editMeta.location || undefined,
        notes: editMeta.notes || undefined,
        rifle_id: editMeta.rifle_id || undefined,
        pellet_id: editMeta.pellet_id || undefined,
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
  })

  function handleImageSelect(file: File | undefined) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('Image must be under 10 MB', 'error')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
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
    })
    setEditing(true)
  }

  const isOwner = currentUser && card ? currentUser.id === card.user_id : false
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

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-lg lg:max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/scores" className="text-muted hover:text-secondary transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg lg:text-xl font-medium tracking-widest uppercase text-secondary">{card.shot_at}</h1>
            {card.league_round_id && cardLeague ? (
              <Link
                to="/leagues/$id"
                params={{ id: cardLeague.id }}
                className="text-[10px] tracking-widest uppercase text-[var(--brass)] bg-[var(--brass)]/10 px-2 py-0.5 rounded hover:bg-[var(--brass)]/20 transition-colors"
              >
                {cardLeague.name}
              </Link>
            ) : (
              <span className="text-[10px] tracking-widest uppercase text-muted bg-surface-hover px-2 py-0.5 rounded">
                {card.league_round_id ? 'League' : 'Personal'}
              </span>
            )}
          </div>
          {card.location && <p className="text-xs text-muted tracking-wide">{card.location}</p>}
        </div>
        {isOwner && !editing && (
          <button onClick={startEdit} className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase text-muted hover:text-[var(--brass)] transition-colors">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

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
              <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Date</label>
              <input type="date" value={editMeta.shot_at} onChange={e => setEditMeta(m => ({ ...m, shot_at: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary font-mono focus:outline-none focus:border-[var(--brass)]/50" />
            </div>
            <div>
              <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Location</label>
              <input type="text" value={editMeta.location} onChange={e => setEditMeta(m => ({ ...m, location: e.target.value }))} placeholder="Range / club" className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50" />
            </div>
          </div>

          {(rifleData?.items ?? []).length > 0 && (
            <div>
              <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Rifle</label>
              <select value={editMeta.rifle_id} onChange={e => setEditMeta(m => ({ ...m, rifle_id: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50">
                <option value="">-- none --</option>
                {(rifleData?.items ?? []).map(r => <option key={r.id} value={r.id}>{r.make} {r.model}</option>)}
              </select>
            </div>
          )}

          {(pelletData?.items ?? []).length > 0 && (
            <div>
              <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Pellet</label>
              <select value={editMeta.pellet_id} onChange={e => setEditMeta(m => ({ ...m, pellet_id: e.target.value }))} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-[var(--brass)]/50">
                <option value="">-- none --</option>
                {(pelletData?.items ?? []).map(p => <option key={p.id} value={p.id}>{p.brand} {p.model}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Notes</label>
            <textarea value={editMeta.notes} onChange={e => setEditMeta(m => ({ ...m, notes: e.target.value }))} rows={2} className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-primary placeholder:text-muted resize-none focus:outline-none focus:border-[var(--brass)]/50" />
          </div>

          {/* Photo upload / replace */}
          <div>
            <label className="block text-[11px] tracking-widest uppercase text-muted mb-1">Score Card Photo</label>
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
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editMeta.shot_at} className="flex-1 py-2.5 rounded bg-[var(--brass)] text-inverse text-sm font-medium tracking-widest uppercase disabled:opacity-40">
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="px-4 py-2.5 rounded border border-subtle text-muted text-sm hover:text-secondary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Desktop: two-column layout */}
      {!editing && <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Left column: score grid + totals */}
        <div className="space-y-6">
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
            {card.league_round_id && (
              <div className="flex justify-between pt-1">
                <span className="text-muted tracking-widest uppercase text-[11px]">Verification</span>
                <VerificationBadge status={card.verification} />
              </div>
            )}
            {card.visibility === 'private' && (
              <div className="flex justify-between pt-1">
                <span className="text-muted tracking-widest uppercase text-[11px]">Visibility</span>
                <span className="text-[11px] tracking-widest uppercase text-muted">Private</span>
              </div>
            )}
          </div>

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
      </div>}

      {/* Audit Trail \u2014 only shown for league cards */}
      {card.league_round_id && (
        <AuditTrailSection scoreCardId={id} cardOwnerID={card.user_id} />
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
          className="flex items-center gap-1.5 text-sm text-muted hover:text-secondary transition-colors ml-auto"
        >
          <Share2 size={18} /> Share
        </button>
      </div>

      {showShare && (
        <ShareDialog
          targetId={id}
          targetType="score_card"
          targetLabel="Score Card"
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Comments */}
      <CommentsSection cardId={id} />

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
            />
          </div>
        </div>
      )}
    </div>
  )
}
