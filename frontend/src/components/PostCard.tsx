import { memo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Target, TestTube2, Globe, Users as UsersIcon, UserCheck, Lock, EyeOff, MoreHorizontal, Flag, Send, AlertTriangle, Edit3, Trash2 } from 'lucide-react'
import { LikeButton } from './LikeButton'
import { ReportDialog } from './ReportDialog'
import { FlagDialog } from './FlagDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { postApi, type Post, type PostAttachment, type PostVisibility } from '../api/posts'
import { commentApi } from '../api/scoreCards'
import { formatDate, formatDateTime, formatRelativeTime, useRegionalPrefs } from '../utils/date'
import { applyPostDeleteToCaches, applyPostEditToCaches } from '../utils/postCache'
import { UserAvatar } from './UserAvatar'
import { can, PERM } from '../utils/moderators'

function AttachmentPreview({ attachment, authorName }: { attachment: PostAttachment; authorName: string }) {
  switch (attachment.type) {
    case 'image':
      return attachment.image_url ? (
        <img
          src={attachment.image_url}
          alt={`Image attached to ${authorName}'s post`}
          className="rounded border border-subtle max-h-48 object-contain bg-surface"
          loading="lazy"
        />
      ) : null
    case 'score_card':
      return attachment.target_id ? (
        <Link
          to="/scores/$id"
          params={{ id: attachment.target_id }}
          className="flex items-center gap-2 px-3 py-2 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
        >
          <Target size={14} className="text-[var(--brass)]" />
          <span className="text-xs tracking-widest uppercase text-secondary">View Score Card</span>
        </Link>
      ) : null
    case 'pellet_test':
      return attachment.target_id ? (
        <Link
          to="/pellet-testing/$id"
          params={{ id: attachment.target_id }}
          className="flex items-center gap-2 px-3 py-2 rounded border border-subtle bg-surface hover:border-[var(--brass)]/30 transition-colors"
        >
          <TestTube2 size={14} className="text-[var(--brass)]" />
          <span className="text-xs tracking-widest uppercase text-secondary">View Pellet Test</span>
        </Link>
      ) : null
    default:
      return null
  }
}

function VisibilityBadge({ visibility }: { visibility: PostVisibility }) {
  const map: Record<PostVisibility, { icon: typeof Globe; label: string }> = {
    public: { icon: Globe, label: 'Public' },
    followers: { icon: UserCheck, label: 'Followers' },
    members: { icon: UsersIcon, label: 'Members' },
    private: { icon: Lock, label: 'Only me' },
    inherit: { icon: UsersIcon, label: 'Members' },
  }
  const entry = map[visibility] ?? map.inherit
  const Icon = entry.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted"
      title={`Visibility: ${entry.label}`}
      aria-label={`Visibility: ${entry.label}`}
    >
      <Icon size={11} />
      {entry.label}
    </span>
  )
}

// ⚡ Bolt: memo prevents re-renders when the parent (Layout) updates due to
// draft-count polling, route changes, or online/offline toggling — the post
// prop is stable for the lifetime of a list view render, so skip is safe.
export const PostCard = memo(function PostCard({ post, onCommentClick }: { post: Post; onCommentClick?: () => void }) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [commentReportId, setCommentReportId] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [editingPost, setEditingPost] = useState(false)
  const [editPostBody, setEditPostBody] = useState(post.body)
  const [confirmDeletePost, setConfirmDeletePost] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null)

  const { data: commentsData } = useQuery({
    queryKey: ['posts', post.id, 'comments'],
    queryFn: () => postApi.listComments(post.id),
    enabled: showComments && !onCommentClick,
  })

  const createCommentMutation = useMutation({
    mutationFn: () => postApi.createComment(post.id, newComment.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', post.id, 'comments'] })
      queryClient.invalidateQueries({ queryKey: ['league', post.league_id, 'posts'] })
      queryClient.invalidateQueries({ queryKey: ['club', post.club_id, 'posts'] })
      setNewComment('')
    },
  })

  const comments = commentsData?.items ?? []

  // Resolve league-admin status for the post's league (cached by leagueId).
  const { data: leagueMembers } = useQuery({
    queryKey: ['leagues', post.league_id, 'members'],
    queryFn: () => leagueApi.listMembers(post.league_id!),
    enabled: !!post.league_id && !!currentUser,
  })
  // Resolve the viewer's club standing for the post's club (cached by clubId).
  const { data: club } = useQuery({
    queryKey: ['clubs', post.club_id],
    queryFn: () => clubsApi.get(post.club_id!),
    enabled: !!post.club_id && !!currentUser,
  })

  const isLeagueModerator = can(
    leagueMembers?.items?.find((m) => m.user_id === currentUser?.id),
    PERM.moderateContent,
  )
  const isClubModerator = can(club, PERM.moderateContent)
  const isGlobalAdmin = currentUser?.role === 'admin'
  const isOwnPost = currentUser?.id === post.user_id
  const canModerate = !isOwnPost && (isGlobalAdmin || isLeagueModerator || isClubModerator)

  const flagMutation = useMutation({
    mutationFn: (reason: string) => postApi.flag(post.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['league', post.league_id, 'posts'] })
      queryClient.invalidateQueries({ queryKey: ['club', post.club_id, 'posts'] })
    },
  })

  const unflagMutation = useMutation({
    mutationFn: () => postApi.unflag(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['league', post.league_id, 'posts'] })
      queryClient.invalidateQueries({ queryKey: ['club', post.club_id, 'posts'] })
      toast('Flag cleared', 'success')
    },
    onError: () => toast('Failed to clear flag', 'error'),
  })

  const updatePostMutation = useMutation({
    mutationFn: () => postApi.update(post.id, editPostBody.trim()),
    onSuccess: (updated) => {
      applyPostEditToCaches(queryClient, updated)
      setEditingPost(false)
      setEditPostBody(updated.body)
      toast('Post updated', 'success')
    },
    onError: () => toast('Failed to save post', 'error'),
  })

  const deletePostMutation = useMutation({
    mutationFn: () => postApi.delete(post.id),
    onSuccess: () => {
      applyPostDeleteToCaches(queryClient, post.id, {
        leagueID: post.league_id,
        clubID: post.club_id,
      })
      toast('Post deleted', 'success')
    },
    onError: () => toast('Failed to delete post', 'error'),
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => commentApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', post.id, 'comments'] })
      setEditingCommentId(null)
    },
    onError: () => toast('Failed to save comment', 'error'),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => commentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', post.id, 'comments'] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['league', post.league_id, 'posts'] })
      queryClient.invalidateQueries({ queryKey: ['club', post.club_id, 'posts'] })
    },
    onError: () => toast('Failed to delete comment', 'error'),
  })

  const prefs = useRegionalPrefs()
  const date = formatRelativeTime(post.created_at, prefs)
  const exactDate = formatDateTime(post.created_at, prefs)
  const isEdited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 5000
  const editedAt = isEdited ? formatDate(post.updated_at, prefs) : null

  const isHidden = !!post.hidden_at

  return (
    <article className="rounded border border-subtle bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <UserAvatar
          user={{ id: post.user_id, display_name: post.display_name, avatar_url: post.avatar_url }}
          size={36}
          className="shrink-0"
          linkToProfile
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-secondary truncate">{post.display_name}</p>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-muted tracking-widest uppercase" title={exactDate}>{date}</p>
            {editedAt && (
              <span className="inline-flex items-center rounded border border-subtle px-1.5 py-0.5 text-[10px] tracking-wide uppercase text-muted">
                Edited {editedAt}
              </span>
            )}
            <VisibilityBadge visibility={post.visibility} />
          </div>
        </div>
        {currentUser && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-1 text-muted hover:text-secondary transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-1 min-w-[180px] rounded border border-subtle bg-surface shadow-lg z-10">
                {isOwnPost && (
                  <>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setEditPostBody(post.body); setEditingPost(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:bg-surface-hover"
                    >
                      <Edit3 size={12} /> Edit post
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setConfirmDeletePost(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--error-text)] hover:bg-surface-hover"
                    >
                      <Trash2 size={12} /> Delete post
                    </button>
                  </>
                )}
                {!isOwnPost && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:bg-surface-hover"
                  >
                    <Flag size={12} /> Report post
                  </button>
                )}
                {canModerate && !post.is_flagged && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setFlagOpen(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-surface-hover"
                  >
                    <Flag size={12} /> Flag for amendment
                  </button>
                )}
                {canModerate && post.is_flagged && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); unflagMutation.mutate() }}
                    disabled={unflagMutation.isPending}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Flag size={12} /> Clear flag
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ReportDialog open={reportOpen} targetType="post" targetId={post.id} onClose={() => setReportOpen(false)} />
      <ReportDialog
        open={commentReportId !== null}
        targetType="comment"
        targetId={commentReportId ?? ''}
        onClose={() => setCommentReportId(null)}
      />
      <FlagDialog
        open={flagOpen}
        targetLabel="post"
        onClose={() => setFlagOpen(false)}
        onSubmit={(reason) => flagMutation.mutateAsync(reason)}
      />

      {/* Moderation banners */}
      {isHidden && (
        <div role="status" className="flex items-start gap-2 rounded border border-[var(--error-border)] bg-[var(--error-bg)] p-2 text-[11px] text-[var(--error-text)]">
          <EyeOff size={12} className="shrink-0 mt-0.5" />
          <span>This post was hidden by moderators. Only you can see it.</span>
        </div>
      )}
      {post.is_flagged && (
        <div role="status" className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
          <Flag size={12} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            {isOwnPost ? (
              <>A moderator flagged this post — please reflect and edit to amend. Your edit clears the flag.</>
            ) : (
              <>Flagged by a moderator — pending amendment.</>
            )}
            {post.flag_reason && (
              <span className="block text-[10px] text-muted mt-0.5">Reason: {post.flag_reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {editingPost ? (
        <div className="space-y-2">
          <textarea
            value={editPostBody}
            onChange={(e) => setEditPostBody(e.target.value)}
            rows={3}
            className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none"
            aria-label="Edit post body"
          />
          <div className="flex gap-2">
            <button
              onClick={() => updatePostMutation.mutate()}
              disabled={updatePostMutation.isPending || !editPostBody.trim()}
              className="px-2.5 py-1 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[11px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updatePostMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditingPost(false); setEditPostBody(post.body) }}
              className="px-2.5 py-1 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{post.body}</p>
      )}

      {/* Attachments */}
      {post.attachments.length > 0 && (
        <div className="space-y-2">
          {post.attachments.map((a) => (
            <AttachmentPreview key={a.id} attachment={a} authorName={post.display_name} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1 border-t border-subtle">
        <LikeButton
          targetId={post.id}
          targetType="post"
          initialLiked={post.is_liked}
          initialCount={post.like_count}
          size={16}
        />
        <button
          onClick={onCommentClick ?? (() => setShowComments((v) => !v))}
          aria-label={`${showComments ? 'Hide' : 'View'} ${post.comment_count} comments`}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-secondary transition-colors"
        >
          <MessageSquare size={16} />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </button>
      </div>

      {/* Inline comments */}
      {showComments && !onCommentClick && (
        <div className="space-y-2 pt-2">
          {comments.length === 0 && (
            <p className="text-xs text-muted">No comments yet.</p>
          )}
          {comments.map((c) => {
            const isEdited = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 5000
            const isOwnComment = currentUser?.id === c.user_id
            return (
              <div key={c.id} className="flex gap-2">
                <UserAvatar
                  user={{ id: c.user_id, display_name: c.display_name, avatar_url: c.avatar_url }}
                  size={24}
                  className="shrink-0"
                  linkToProfile
                />
                <div className="flex-1 min-w-0 rounded bg-surface-hover px-2 py-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-primary">{c.display_name}</span>
                      {isEdited && (
                        <span className="ml-1 text-[10px] italic text-muted">(edited)</span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {isOwnComment && editingCommentId !== c.id && (
                        <>
                          <button
                            onClick={() => { setEditingCommentId(c.id); setEditCommentBody(c.body) }}
                            className="p-1 text-muted hover:text-secondary transition-colors"
                            aria-label="Edit comment"
                            title="Edit comment"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCommentId(c.id)}
                            disabled={deleteCommentMutation.isPending}
                            className="p-1 text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Delete comment"
                            title="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {!isOwnComment && currentUser && (
                        <button
                          onClick={() => setCommentReportId(c.id)}
                          className="p-1 text-muted hover:text-[var(--error-text)] transition-colors"
                          aria-label="Report comment"
                          title="Report inappropriate comment"
                        >
                          <AlertTriangle size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="mt-1 space-y-1">
                      <textarea
                        value={editCommentBody}
                        onChange={(e) => setEditCommentBody(e.target.value)}
                        rows={2}
                        className="w-full bg-surface border border-subtle rounded px-2 py-1 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none"
                        aria-label="Edit comment body"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateCommentMutation.mutate({ id: c.id, body: editCommentBody.trim() })}
                          disabled={updateCommentMutation.isPending || !editCommentBody.trim()}
                          className="px-2 py-0.5 rounded bg-[var(--brass)]/20 border border-[var(--brass)]/30 text-[10px] tracking-widest uppercase text-[var(--brass)] hover:bg-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updateCommentMutation.isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingCommentId(null)}
                          className="px-2 py-0.5 rounded border border-subtle text-[10px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-secondary whitespace-pre-wrap">{c.body}</p>
                  )}
                </div>
              </div>
            )
          })}

          {currentUser && !editingCommentId && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newComment.trim()) createCommentMutation.mutate()
              }}
              className="flex flex-col gap-1 mt-2"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  aria-label="Add a comment"
                  aria-describedby={newComment.length > 420 ? 'comment-char-count' : undefined}
                  className="flex-1 rounded border border-subtle bg-surface px-2 py-1 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-[var(--brass)]/50"
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || createCommentMutation.isPending}
                  aria-label="Post comment"
                  className="p-1.5 rounded border border-subtle text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={12} />
                </button>
              </div>
              {newComment.length > 420 && (
                <p
                  id="comment-char-count"
                  aria-live="polite"
                  className={`text-[10px] text-right tabular-nums ${newComment.length >= 490 ? 'text-[var(--error-text)]' : 'text-muted'}`}
                >
                  {500 - newComment.length} remaining
                </p>
              )}
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeletePost}
        title="Delete post?"
        message="This post will be permanently removed."
        onConfirm={() => { deletePostMutation.mutate(); setConfirmDeletePost(false) }}
        onCancel={() => setConfirmDeletePost(false)}
      />

      <ConfirmDialog
        open={confirmDeleteCommentId !== null}
        title="Delete comment?"
        message="This comment will be permanently removed."
        onConfirm={() => {
          if (confirmDeleteCommentId) deleteCommentMutation.mutate(confirmDeleteCommentId)
          setConfirmDeleteCommentId(null)
        }}
        onCancel={() => setConfirmDeleteCommentId(null)}
      />
    </article>
  )
})
