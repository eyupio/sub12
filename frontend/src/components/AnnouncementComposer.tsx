import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Users } from 'lucide-react'
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  announcementsApi,
  type AnnouncementScope,
} from '../api/announcements'
import { toast } from '../store/toast'
import { formatDateTime, useRegionalPrefs } from '../utils/date'
import { SkeletonList } from './Skeleton'

function announcementHref(id: string): string {
  return `/announcements/${id}`
}

interface Props {
  scope: AnnouncementScope
  /** League id, club id, event slug — ignored for the platform scope. */
  scopeId: string
  /** Who this reaches, spelled out before they press send. */
  audienceLabel: string
  /** Hide the composer for a moderator without the capability; the log stays. */
  canSend: boolean
}

/**
 * Compose and review announcements for one scope. Sending is irreversible —
 * there is no unsend — so the form confirms the audience before it will submit
 * and says plainly how many people it reached afterwards.
 */
export default function AnnouncementComposer({ scope, scopeId, audienceLabel, canSend }: Props) {
  const queryClient = useQueryClient()
  const prefs = useRegionalPrefs()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const queryKey = ['announcements', scope, scopeId]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => announcementsApi.list(scope, scopeId),
  })

  const mutation = useMutation({
    mutationFn: () => announcementsApi.send(scope, scopeId, { title, body, send_email: sendEmail }),
    onSuccess: (sent) => {
      queryClient.invalidateQueries({ queryKey })
      setTitle('')
      setBody('')
      setSendEmail(false)
      setConfirming(false)
      toast(`Announcement sent to ${sent.recipient_count} ${sent.recipient_count === 1 ? 'person' : 'people'}`, 'success')
    },
    onError: () => {
      setConfirming(false)
      toast('Failed to send announcement', 'error')
    },
  })

  const ready = title.trim() !== '' && body.trim() !== ''
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      {canSend && (
        <form
          className="surface-card p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!ready) return
            if (!confirming) {
              setConfirming(true)
              return
            }
            mutation.mutate()
          }}
        >
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-[var(--brass)]" />
            <h3 className="t-section-title">New announcement</h3>
          </div>
          <p className="text-xs text-muted">Goes to {audienceLabel}. It can&rsquo;t be unsent.</p>

          <label className="block">
            <span className="sr-only">Announcement title</span>
            <input
              className="field"
              placeholder="Title"
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setConfirming(false)
              }}
              aria-label="Announcement title"
            />
          </label>

          <label className="block">
            <span className="sr-only">Announcement message</span>
            <textarea
              className="field min-h-28"
              placeholder="What do they need to know?"
              maxLength={ANNOUNCEMENT_BODY_MAX}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setConfirming(false)
              }}
              aria-label="Announcement message"
            />
          </label>
          <p className="text-[10px] tracking-widest uppercase text-muted text-right u-tnum">
            {body.length}/{ANNOUNCEMENT_BODY_MAX}
          </p>

          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => {
                setSendEmail(e.target.checked)
                setConfirming(false)
              }}
              aria-label="Also send by email"
            />
            Also send by email (recipients who have turned announcement email off still won&rsquo;t get one)
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || mutation.isPending}>
              {mutation.isPending ? 'Sending…' : confirming ? `Confirm — send to ${audienceLabel}` : 'Send announcement'}
            </button>
            {confirming && !mutation.isPending && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="space-y-2">
        <h3 className="t-section-title">Sent announcements</h3>
        {isLoading && <SkeletonList count={2} />}
        {!isLoading && items.length === 0 && <p className="text-xs text-muted">Nothing announced yet.</p>}
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                // Widened to string on purpose: a template literal narrows to
                // a type the router's `to` union won't accept.
                to={announcementHref(a.id)}
                className="block p-3 rounded border border-subtle bg-surface u-nudge"
              >
                <p className="text-sm text-secondary font-medium break-words">{a.title}</p>
                <p className="text-xs text-muted mt-0.5 line-clamp-2 break-words">{a.body}</p>
                <p className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-muted mt-1">
                  <Users size={11} />
                  {a.recipient_count}
                  {a.email_sent && ' · emailed'}
                  {' · '}
                  {formatDateTime(a.created_at, prefs)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
