import { Link } from '@tanstack/react-router'
import { MessageSquare, Target, TestTube2 } from 'lucide-react'
import { LikeButton } from './LikeButton'
import type { Post, PostAttachment } from '../api/posts'

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

export function PostCard({ post, onCommentClick }: { post: Post; onCommentClick?: () => void }) {
  const initials = post.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const date = new Date(post.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="rounded border border-subtle bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
          {post.avatar_url ? (
            <img src={post.avatar_url} alt={post.display_name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-secondary">{post.display_name}</p>
          <p className="text-[10px] text-muted tracking-widest uppercase">{date}</p>
        </div>
      </div>

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
          className="flex items-center gap-1.5 text-sm text-muted hover:text-secondary transition-colors"
        >
          <MessageSquare size={16} />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </button>
      </div>
    </div>
  )
}
