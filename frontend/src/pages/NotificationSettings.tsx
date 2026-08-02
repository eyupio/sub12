import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { NotificationPreferencesPanel } from '../components/NotificationPreferencesPanel'
import { HelpIcon } from '../components/Tooltip'
import { pageHelp } from '../components/tooltips'

export default function NotificationSettings() {
  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/profile" className="text-muted hover:text-secondary" aria-label="Back to profile">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="t-page-title">Notifications</h1>
        <HelpIcon content={pageHelp.notificationSettings} />
      </div>

      <NotificationPreferencesPanel />
    </div>
  )
}
