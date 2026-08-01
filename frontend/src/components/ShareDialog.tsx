import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Capacitor } from '@capacitor/core'
import { X, Share2, Link as LinkIcon, Facebook, Mail, MessageCircle } from 'lucide-react'
import { postApi, SharePayload } from '../api/posts'
import { leagueApi } from '../api/leagues'
import { clubsApi } from '../api/clubs'
import { toast } from '../store/toast'
import { siteOrigin } from '../utils/site'
import { shareExternally, hasSystemShare } from '../utils/share'

type Destination = 'personal' | 'league' | 'club'

type InternalTargetType = 'score_card' | 'pellet_test'
export type ShareTargetType = InternalTargetType | 'league' | 'club' | 'user'

interface ShareDialogProps {
  targetId: string
  targetType: ShareTargetType
  targetLabel: string
  shareTitle?: string
  shareText?: string
  /**
   * Human-readable identifier for the shared entity, used in place of the UUID
   * so a pasted link reads as /share/users/paul-jennings. Users, leagues and
   * clubs have one; score cards and pellet tests don't and keep their UUID.
   * Falls back to targetId when absent — the backend resolves either form.
   */
  targetSlug?: string
  onClose: () => void
}

// Share URLs use paths distinct from the in-app authed routes for entities
// whose canonical in-app URL is already gated behind /app auth (leagues,
// clubs, user profiles). The /share/… paths let anonymous visitors see a
// public preview while signed-in users get auto-redirected to the full
// experience.
const publicPathByType: Record<ShareTargetType, string> = {
  score_card: '/score-cards',
  pellet_test: '/pellet-tests',
  league: '/share/leagues',
  club: '/share/clubs',
  user: '/share/users',
}

function isInternalShareType(t: ShareTargetType): t is InternalTargetType {
  return t === 'score_card' || t === 'pellet_test'
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Inline X-mark for the X (formerly Twitter) share button. Lucide still ships
// the old bird under "Twitter" which reads as a different brand next to the
// "X" label.
function XMarkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2H21l-6.49 7.41L22 22h-6.63l-4.87-6.36L4.77 22H2l6.97-7.96L2 2h6.76l4.4 5.81L18.244 2Zm-1.16 18h1.86L7.02 4H5.06l12.024 16Z" />
    </svg>
  )
}

export function ShareDialog({ targetId, targetType, targetLabel, shareTitle, shareText: shareTextProp, targetSlug, onClose }: ShareDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [destination, setDestination] = useState<Destination>('personal')
  const [entityId, setEntityId] = useState('')
  const [body, setBody] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const [showChannels, setShowChannels] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const manualCopyRef = useRef<HTMLInputElement>(null)

  const canPostInternal = isInternalShareType(targetType)
  // Build the link from the canonical public host, not window.location.origin —
  // on native the latter is capacitor://localhost / https://localhost, which is
  // useless once the link leaves the app.
  const origin = siteOrigin()
  const shareUrl = `${origin}${publicPathByType[targetType]}/${targetSlug?.trim() || targetId}`
  const shareText = shareTextProp?.trim() || `${targetLabel} on sub-12`
  const effectiveTitle = shareTitle?.trim() || targetLabel
  const systemShare = hasSystemShare()
  // The explicit channel grid uses window.open, which inside a native WebView
  // opens in-app or no-ops instead of handing off to the OS browser/mail apps.
  // The native share sheet already lists the user's installed share targets, so
  // we hide the grid (and its "More options" reveal) on native entirely.
  const isNative = Capacitor.isNativePlatform()

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
      if (!canPostInternal) {
        return Promise.reject(new Error('internal share not supported for this target type'))
      }
      const payload: SharePayload = {
        target_id: targetId,
        target_type: targetType as InternalTargetType,
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

  // Restore focus to whatever opened the dialog when it closes — standard
  // modal behaviour; without it keyboard users lose their place in the page.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstFocusable?.focus()
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      // Keep Tab cycling inside the dialog. The league/club <select> would
      // otherwise let focus escape to the page behind the overlay on the
      // next Tab, defeating the modal contract.
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(shareUrl)
      toast('Link copied', 'success')
    } catch {
      // Programmatic clipboard fails on HTTP origins and in some in-app
      // browsers. Reveal the URL in a selectable field so the user still has
      // a path to copy it manually instead of being left with just a toast.
      setManualCopy(true)
      toast('Copy the link below', 'info')
      requestAnimationFrame(() => {
        manualCopyRef.current?.select()
        manualCopyRef.current?.focus()
      })
    }
  }

  function openExternal(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  // Primary external share: delegate to the OS share sheet where available
  // (Capacitor Share plugin on native, Web Share API on web), falling back to an
  // inline grid of explicit channels otherwise. Keeps the dialog uncluttered on
  // modern mobile while still working on desktop Chrome and platforms that
  // haven't shipped a system share sheet.
  async function primaryShare() {
    const result = await shareExternally({ title: effectiveTitle, text: shareText, url: shareUrl })
    if (result !== 'shared') {
      // No system sheet, or the user dismissed it. A dismissal is a cancel, not a
      // failure, so no toast — but reveal the fallback channels in case the user
      // wanted a specific destination the OS sheet didn't offer (common for
      // desktop browsers and locked-down work phones).
      setShowChannels(true)
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
        ref={dialogRef}
        className="bg-card border border-subtle rounded-lg shadow-lg w-full max-w-md mx-4 p-4 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            id="share-dialog-title"
            className="text-sm font-medium tracking-widest uppercase text-secondary flex items-center gap-2"
          >
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

        {/* Internal: post to sub-12 — only offered for content types the feed understands */}
        {canPostInternal && (
        <section className="space-y-3">
          <h3 className="t-section-title">Post to sub-12</h3>

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
              className="px-3 py-2 rounded border border-subtle t-section-title hover:text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending || needsEntity}
              className="px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {shareMutation.isPending ? 'Sharing...' : 'Share'}
            </button>
          </div>

          {shareMutation.isError && (
            <p className="text-[var(--error-text)] text-xs">Failed to share. Please try again.</p>
          )}
        </section>
        )}

        {/* External sharing — offered for every target type */}
        <section className={`space-y-3 ${canPostInternal ? 'border-t border-subtle pt-4' : ''}`}>
          <h3 className="t-section-title">Share externally</h3>

          {/* Primary: single Share button. Platforms that support the Web
              Share API get the native share sheet (which includes the user's
              preferred channels, including Copy). Everywhere else the button
              expands the explicit channel grid below. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={primaryShare}
              aria-label="Share externally"
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[var(--brass)] text-inverse text-[11px] tracking-widest uppercase font-medium hover:opacity-90 transition-opacity"
            >
              <Share2 size={14} />
              Share
            </button>
            <button
              onClick={copyLink}
              aria-label="Copy link"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-subtle t-section-title hover:text-secondary hover:border-[var(--brass)]/40 transition-colors"
            >
              <LinkIcon size={14} />
              Copy link
            </button>
            {systemShare && !showChannels && !isNative && (
              <button
                onClick={() => setShowChannels(true)}
                className="ml-auto t-section-title hover:text-secondary transition-colors"
              >
                More options
              </button>
            )}
          </div>

          {/* Fallback channel grid: rendered automatically when there's no system
              share sheet, revealed on demand otherwise. */}
          {(!systemShare || showChannels) && !isNative && (
            <div className="flex flex-wrap gap-2 pt-1">
              <ExternalButton
                onClick={() => openExternal(twitterHref)}
                label="X"
                icon={<XMarkIcon size={14} />}
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
            </div>
          )}

          {manualCopy && (
            <div className="space-y-1">
              <label htmlFor="share-dialog-manual-copy" className="t-section-title">
                Link
              </label>
              <input
                id="share-dialog-manual-copy"
                ref={manualCopyRef}
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-surface border border-subtle rounded px-3 py-1.5 text-xs text-secondary focus:outline-none focus:border-[var(--brass)]/50"
              />
            </div>
          )}
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
      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle t-section-title hover:text-secondary hover:border-[var(--brass)]/40 transition-colors"
    >
      {icon}
      {label}
    </button>
  )
}
