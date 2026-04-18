import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { X, Share2, Link as LinkIcon, Twitter, Facebook, Mail, MessageCircle } from 'lucide-react'
import { postApi, SharePayload } from '../api/posts'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { toast } from '../store/toast'

type Destination = 'personal' | 'league' | 'club'

interface ShareDialogProps {
  targetId: string
  targetType: 'score_card' | 'pellet_test'
  targetLabel: string
  onClose: () => void
}

export function ShareDialog({ targetId, targetType, targetLabel, onClose }: ShareDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [destination, setDestination] = useState<Destination>('personal')
  const [entityId, setEntityId] = useState('')
  const [body, setBody] = useState('')

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl =
    targetType === 'score_card'
      ? `${origin}/score-cards/${targetId}`
      : `${origin}/pellet-tests/${targetId}`
  const shareText = `${targetLabel} on sub-12`
  const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const { data: leagues } = useQuery({
    queryKey: ['my-leagues'],
    queryFn: () => leagueApi.listMine(),
    enabled: destination === 'league',
  })

  const { data: clubs } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list(),
    enabled: destination === 'club',
  })

  const shareMutation = useMutation({
    mutationFn: () => {
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
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (destination === 'league' && entityId) {
        queryClient.invalidateQueries({ queryKey: ['league', entityId, 'posts'] })
      }
      if (destination === 'club' && entityId) {
        queryClient.invalidateQueries({ queryKey: ['club', entityId, 'posts'] })
      }
      toast('Shared successfully', 'success')
      onClose()
      if (destination === 'league' && entityId) {
        navigate({ to: '/leagues/$id', params: { id: entityId } })
      } else if (destination === 'club' && entityId) {
        navigate({ to: '/clubs/$id', params: { id: entityId } })
      }
    },
    onError: () => {
      toast('Failed to share', 'error')
    },
  })

  const needsEntity = (destination === 'league' || destination === 'club') && !entityId

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast('Link copied', 'success')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  function openExternal(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: targetLabel, text: shareText, url: shareUrl })
    } catch {
      // User dismissed or share failed — no toast needed for user-cancelled share.
    }
  }

  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
  const emailHref = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-bg)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-subtle rounded-lg shadow-lg w-full max-w-md mx-4 p-4 space-y-5"
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Internal: post to sub-12 */}
        <section className="space-y-3">
          <h3 className="text-[11px] tracking-widest uppercase text-muted">Post to sub-12</h3>

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
              aria-label="Select a league"
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
              aria-label="Select a club"
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
        </section>

        {/* External sharing */}
        <section className="space-y-3 border-t border-subtle pt-4">
          <h3 className="text-[11px] tracking-widest uppercase text-muted">Share externally</h3>
          <div className="flex flex-wrap gap-2">
            <ExternalButton onClick={copyLink} label="Copy link" icon={<LinkIcon size={14} />} />
            <ExternalButton
              onClick={() => openExternal(twitterHref)}
              label="X"
              icon={<Twitter size={14} />}
            />
            <ExternalButton
              onClick={() => openExternal(facebookHref)}
              label="Facebook"
              icon={<Facebook size={14} />}
            />
            <ExternalButton
              onClick={() => openExternal(whatsappHref)}
              label="WhatsApp"
              icon={<MessageCircle size={14} />}
            />
            <ExternalButton
              onClick={() => openExternal(emailHref)}
              label="Email"
              icon={<Mail size={14} />}
            />
            {hasWebShare && (
              <ExternalButton
                onClick={nativeShare}
                label="More…"
                icon={<Share2 size={14} />}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

interface ExternalButtonProps {
  onClick: () => void
  label: string
  icon: React.ReactNode
}

function ExternalButton({ onClick, label, icon }: ExternalButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-[11px] tracking-widest uppercase text-muted hover:text-secondary hover:border-[var(--brass)]/40 transition-colors"
    >
      {icon}
      {label}
    </button>
  )
}
