import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CornerDownRight, Edit3, Flag, MessageSquare, Send, Trash2 } from 'lucide-react'
import { scoreCardApi, commentApi, Comment } from '../api/scoreCards'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { ConfirmDialog } from './ConfirmDialog'
import { FlagDialog } from './FlagDialog'
import { LikeButton } from './LikeButton'
import { ReportDialog } from './ReportDialog'
import { UserAvatar } from './UserAvatar'
import { formatDate, useRegionalPrefs } from '../utils/date'

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

export function ScoreCardComments({
  cardId,
  canModerate,
  communityName,
  className = 'pt-6 border-t border-subtle space-y-4',
}: { cardId: string; canModerate: boolean; communityName?: string; className?: string }) {
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
    <div className={className}>
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
