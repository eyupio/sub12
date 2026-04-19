import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Globe, Users as UsersIcon, UserCheck, Lock } from 'lucide-react'
import { postApi, CreatePostPayload, PostVisibility } from '../api/posts'
import { useAuthStore } from '../store/auth'
import { toast } from '../store/toast'

type GroupPostVisibility = 'members' | 'public'

interface PostComposerProps {
  leagueId?: string
  clubId?: string
  queryKey: unknown[]
  // When the composer is scoped to a league/club, the group admin sets the
  // policy; the poster does not choose. Pass the current setting so we can
  // show a read-only label.
  groupPostVisibility?: GroupPostVisibility
}

interface VisibilityOption {
  value: PostVisibility
  label: string
  description: string
  icon: typeof Globe
}

const UNSCOPED_OPTIONS: VisibilityOption[] = [
  { value: 'public', label: 'Public', description: 'Everyone', icon: Globe },
  { value: 'followers', label: 'Followers', description: 'Only people who follow you', icon: UserCheck },
  { value: 'private', label: 'Only me', description: 'Not visible to anyone else', icon: Lock },
]

function scopedVisibilityLabel(v: GroupPostVisibility): { label: string; icon: typeof Globe } {
  return v === 'public'
    ? { label: 'Public (set by admin)', icon: Globe }
    : { label: 'Members only (set by admin)', icon: UsersIcon }
}

export function PostComposer({ leagueId, clubId, queryKey, groupPostVisibility }: PostComposerProps) {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const scoped = !!(leagueId || clubId)
  const [visibility, setVisibility] = useState<PostVisibility>('public')

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreatePostPayload = {
        body: body.trim(),
        league_id: leagueId,
        club_id: clubId,
        // Scoped posts: backend resolves visibility from the group admin's
        // post_visibility setting. Any value sent here is ignored server-side.
        visibility: scoped ? undefined : visibility,
      }
      return postApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setBody('')
      if (!scoped) setVisibility('public')
      toast('Posted', 'success')
    },
    onError: () => toast('Failed to create post', 'error'),
  })

  const scopedLabel = useMemo(
    () => (scoped ? scopedVisibilityLabel(groupPostVisibility ?? 'members') : null),
    [scoped, groupPostVisibility],
  )

  if (!currentUser) return null

  const initials = currentUser.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="rounded border border-subtle bg-surface p-3 space-y-3">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full overflow-hidden border border-subtle flex-shrink-0 bg-surface-hover flex items-center justify-center text-[11px] font-medium text-muted">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt={currentUser.display_name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's on your mind? (⌘/Ctrl + Enter to post)"
          aria-label="Post body"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) {
              e.preventDefault()
              mutation.mutate()
            }
          }}
          className="flex-1 bg-page border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
        />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {scopedLabel ? (
          <div
            className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted"
            title="The league or club admin controls this setting."
          >
            <span className="tracking-widest uppercase">Visibility</span>
            <scopedLabel.icon size={12} />
            <span className="text-xs text-secondary">{scopedLabel.label}</span>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-[11px] tracking-wide text-muted">
            <span className="tracking-widest uppercase">Visibility</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as PostVisibility)}
              aria-label="Post visibility"
              className="bg-page border border-subtle rounded px-2 py-1 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50"
            >
              {UNSCOPED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} title={opt.description}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !body.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={12} />
          {mutation.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
      {mutation.isError && (
        <p className="text-[var(--error-text)] text-xs">Failed to create post.</p>
      )}
    </div>
  )
}
