import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Share2, Copy, Check, Twitter, Facebook, Linkedin, MessageCircle, Smartphone } from 'lucide-react'
import { postApi, SharePayload } from '../api/posts'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { toast } from '../store/toast'

type Destination = 'personal' | 'league' | 'club'
type Tab = 'social' | 'internal'

export type ShareTargetType =
  | 'score_card'
  | 'pellet_test'
  | 'user'
  | 'achievement'
  | 'league'
  | 'club'

interface ShareDialogProps {
  targetId: string
  targetType: ShareTargetType
  targetLabel: string
  // Absolute /share/... URL that crawlers hit for Open Graph; this is what
  // gets posted to Twitter/Facebook/etc. Safe for all viewers.
  shareUrl: string
  // Text prefilled for tweet / message composers; keep under ~120 chars.
  shareTitle?: string
  // Whether to expose the "re-post to feed/league/club" tab. Score cards and
  // pellet tests can be re-posted (they're the only types postApi.share
  // accepts); everything else only gets the external-share tab.
  allowInternal?: boolean
  onClose: () => void
}

const btnOutline =
  'flex items-center justify-center gap-2 px-3 py-2 rounded border border-subtle text-muted hover:text-[var(--brass)] hover:border-[var(--brass)]/30 transition-colors text-[11px] tracking-widest uppercase'

export function ShareDialog({
  targetId,
  targetType,
  targetLabel,
  shareUrl,
  shareTitle,
  allowInternal,
  onClose,
}: ShareDialogProps) {
  const supportsInternal = allowInternal && (targetType === 'score_card' || targetType === 'pellet_test')
  const [tab, setTab] = useState<Tab>(supportsInternal ? 'social' : 'social')
  const [destination, setDestination] = useState<Destination>('personal')
  const [entityId, setEntityId] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: leagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: tab === 'internal' && destination === 'league',
  })

  const { data: clubs } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list(),
    enabled: tab === 'internal' && destination === 'club',
  })

  const shareMutation = useMutation({
    mutationFn: () => {
      if (targetType !== 'score_card' && targetType !== 'pellet_test') {
        return Promise.reject(new Error('Internal share not supported for this target'))
      }
      const payload: SharePayload = {
        target_id: targetId,
        target_type: targetType,
        body: body.trim() || undefined,
      }
      if (destination === 'league' && entityId) payload.league_id = entityId
      if (destination === 'club' && entityId) payload.club_id = entityId
      return postApi.share(payload)
    },
    onSuccess: () => {
      toast('Shared successfully', 'success')
      onClose()
    },
    onError: () => {
      toast('Failed to share', 'error')
    },
  })

  const needsEntity = (destination === 'league' || destination === 'club') && !entityId
  const shareText = shareTitle || `Check out this ${targetLabel} on sub-12`

  function openWindow(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=600')
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        toast('Link copied', 'success')
      },
      () => toast('Failed to copy link', 'error'),
    )
  }

  function nativeShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({ title: shareText, text: shareText, url: shareUrl }).catch(() => {})
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedText = encodeURIComponent(shareText)
  const twitterURL = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
  const facebookURL = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
  const linkedinURL = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
  const whatsappURL = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-subtle rounded-lg shadow-lg w-full max-w-md mx-4 p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-widest uppercase text-secondary flex items-center gap-2">
            <Share2 size={14} />
            Share {targetLabel}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab selector (only when internal re-post is supported) */}
        {supportsInternal && (
          <div className="flex gap-1.5 border-b border-subtle pb-2">
            <button
              onClick={() => setTab('social')}
              className={`px-3 py-1.5 rounded text-[11px] tracking-widest uppercase border transition-colors ${
                tab === 'social'
                  ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              Social
            </button>
            <button
              onClick={() => setTab('internal')}
              className={`px-3 py-1.5 rounded text-[11px] tracking-widest uppercase border transition-colors ${
                tab === 'internal'
                  ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                  : 'border-subtle text-muted hover:text-secondary'
              }`}
            >
              Post to sub-12
            </button>
          </div>
        )}

        {tab === 'social' ? (
          <div className="space-y-3">
            <p className="text-[11px] text-muted">
              Share a preview-rich link with dynamic title, description, and cover image.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {canNativeShare && (
                <button onClick={nativeShare} className={btnOutline}>
                  <Smartphone size={14} />
                  Share…
                </button>
              )}
              <button onClick={() => openWindow(twitterURL)} className={btnOutline}>
                <Twitter size={14} />
                X / Twitter
              </button>
              <button onClick={() => openWindow(facebookURL)} className={btnOutline}>
                <Facebook size={14} />
                Facebook
              </button>
              <button onClick={() => openWindow(whatsappURL)} className={btnOutline}>
                <MessageCircle size={14} />
                WhatsApp
              </button>
              <button onClick={() => openWindow(linkedinURL)} className={btnOutline}>
                <Linkedin size={14} />
                LinkedIn
              </button>
              <button onClick={copyLink} className={btnOutline}>
                {copied ? <Check size={14} className="text-[var(--brass)]" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Destination selector */}
            <div className="flex gap-1.5">
              {(['personal', 'league', 'club'] as Destination[]).map((d) => (
                <button
                  key={d}
                  onClick={() => { setDestination(d); setEntityId('') }}
                  className={`px-3 py-1.5 rounded text-[11px] tracking-widest uppercase border transition-colors ${
                    destination === d
                      ? 'border-[var(--brass)]/40 text-[var(--brass)] bg-[var(--brass)]/5'
                      : 'border-subtle text-muted hover:text-secondary'
                  }`}
                >
                  {d === 'personal' ? 'My Feed' : d}
                </button>
              ))}
            </div>

            {/* Entity selector */}
            {destination === 'league' && (
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
              >
                <option value="">Select a league...</option>
                {(leagues?.items ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}

            {destination === 'club' && (
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full rounded border border-subtle bg-surface px-3 py-1.5 text-sm text-primary"
              >
                <option value="">Select a club...</option>
                {(clubs?.items ?? []).filter((c) => c.is_member).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            {/* Optional body */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a message (optional)..."
              rows={2}
              className="w-full bg-surface border border-subtle rounded px-3 py-2 text-sm text-secondary focus:outline-none focus:border-[var(--brass)]/50 resize-none placeholder-muted"
            />

            {/* Submit */}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => shareMutation.mutate()}
                disabled={shareMutation.isPending || needsEntity}
                className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-40 transition-colors"
              >
                {shareMutation.isPending ? 'Sharing...' : 'Share'}
              </button>
            </div>

            {shareMutation.isError && (
              <p className="text-[var(--error-text)] text-xs">Failed to share. Please try again.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
