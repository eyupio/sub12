import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MessageSquare, Target, TestTube2, Globe, Users as UsersIcon, UserCheck, Lock, EyeOff, MoreHorizontal, Flag } from 'lucide-react'
import { LikeButton } from './LikeButton'
import { ReportDialog } from './ReportDialog'
import { useAuthStore } from '../store/auth'
import type { Post, PostAttachment, PostVisibility } from '../api/posts'
import { formatDate, useRegionalPrefs } from '../utils/date'

function AttachmentPreview({ attachment }: { attachment: PostAttachment }) {
  switch (attachment.type) {
    case 'image':
      return attachment.image_url ? (
        <img
          src={attachment.image_url}
          alt="Attached image"
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

export function PostCard({ post, onCommentClick }: { post: Post; onCommentClick?: () => void }) {
  const currentUser = useAuthStore((s) => s.user)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const initials = post.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const prefs = useRegionalPrefs()
  const date = formatDate(post.created_at, prefs)

  const isHidden = !!post.hidden_at
  const isOwnPost = currentUser?.id === post.user_id

  return (
    <article className="rounded border border-subtle bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
          {post.avatar_url ? (
            <img src={post.avatar_url} alt={post.display_name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-secondary truncate">{post.display_name}</p>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-muted tracking-widest uppercase">{date}</p>
            <VisibilityBadge visibility={post.visibility} />
          </div>
        </div>
        {!isOwnPost && currentUser && (
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
              <div role="menu" className="absolute right-0 top-full mt-1 min-w-[140px] rounded border border-subtle bg-surface shadow-lg z-10">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:bg-surface-hover"
                >
                  <Flag size={12} /> Report post
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <ReportDialog open={reportOpen} targetType="post" targetId={post.id} onClose={() => setReportOpen(false)} />

      {/* Moderation banner (author view only; hidden posts never reach other viewers) */}
      {isHidden && (
        <div role="status" className="flex items-start gap-2 rounded border border-[var(--error-border)] bg-[var(--error-bg)] p-2 text-[11px] text-[var(--error-text)]">
          <EyeOff size={12} className="shrink-0 mt-0.5" />
          <span>This post was hidden by moderators. Only you can see it.</span>
        </div>
      )}

      {/* Body */}
      <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{post.body}</p>

      {/* Attachments */}
      {post.attachments.length > 0 && (
        <div className="space-y-2">
          {post.attachments.map((a) => (
            <AttachmentPreview key={a.id} attachment={a} />
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
          onClick={onCommentClick}
          aria-label={`View ${post.comment_count} comments`}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-secondary transition-colors"
        >
          <MessageSquare size={16} />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </button>
      </div>
    </article>
  )
}
