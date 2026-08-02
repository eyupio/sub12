import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import AnnouncementComposer from '../components/AnnouncementComposer'

/**
 * Platform-wide announcements. Every other scope reaches the people who opted
 * into a group; this one reaches every account on sub12.io, so it lives behind
 * the admin role and says so.
 */
export default function AdminAnnouncements() {
  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="text-muted hover:text-secondary" aria-label="Back">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="t-page-title">Announcements</h1>
      </div>

      <p className="text-xs text-muted">
        Goes to every account on sub12.io. Simulated personas are excluded.
      </p>

      <AnnouncementComposer scope="platform" scopeId="" audienceLabel="everyone on sub12.io" canSend />
    </div>
  )
}
