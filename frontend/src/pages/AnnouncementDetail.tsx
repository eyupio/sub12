import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Megaphone, Users } from 'lucide-react'
import { announcementsApi, type Announcement } from '../api/announcements'
import { SkeletonPage } from '../components/Skeleton'
import { formatDateTime, useRegionalPrefs } from '../utils/date'

/** Where the announcement's group lives, so a reader can go to the thing it
 *  is about. Platform announcements have no group to return to. */
function scopeLink(a: Announcement): { to: string; label: string } | null {
  if (a.scope === 'league' && a.league_id) return { to: `/leagues/${a.league_id}`, label: a.scope_name ?? 'League' }
  if (a.scope === 'club' && a.club_id) return { to: `/clubs/${a.club_id}`, label: a.scope_name ?? 'Club' }
  if (a.scope === 'event' && a.event_slug) return { to: `/events/${a.event_slug}`, label: a.scope_name ?? 'Event' }
  return null
}

export default function AnnouncementDetail() {
  const { id } = useParams({ strict: false }) as { id: string }
  const prefs = useRegionalPrefs()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['announcement', id],
    queryFn: () => announcementsApi.get(id),
  })

  if (isLoading) return <SkeletonPage />

  if (isError || !data) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-3">
        <p role="alert" className="text-sm text-[var(--error-text)]">
          This announcement isn&rsquo;t available to you.
        </p>
        <Link to="/notifications" className="t-section-title hover:text-secondary">
          Back to notifications
        </Link>
      </div>
    )
  }

  const scope = scopeLink(data)

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/notifications" className="text-muted hover:text-secondary" aria-label="Back to notifications">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="t-page-title">Announcement</h1>
      </div>

      <article className="surface-card p-4 space-y-3 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center text-[var(--brass)] shrink-0">
            <Megaphone size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-secondary break-words">{data.title}</h2>
            <p className="text-xs text-muted mt-0.5">
              {data.author_display_name ?? 'A moderator'}
              {scope && (
                <>
                  {' · '}
                  <Link to={scope.to} className="hover:text-secondary underline underline-offset-2">
                    {scope.label}
                  </Link>
                </>
              )}
              {data.scope === 'platform' && ' · sub12.io'}
            </p>
            <p className="text-[10px] tracking-widest uppercase text-muted mt-0.5">
              {formatDateTime(data.created_at, prefs)}
            </p>
          </div>
        </div>

        <p className="text-sm text-secondary whitespace-pre-wrap break-words selectable">{data.body}</p>
      </article>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Users size={13} />
        Sent to {data.recipient_count} {data.recipient_count === 1 ? 'person' : 'people'}
        {data.email_sent && ', by email as well as in-app'}
      </p>
    </div>
  )
}
