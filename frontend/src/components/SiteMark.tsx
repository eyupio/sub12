import { Sub12BrandLockup } from './Sub12BrandLockup'
import { useBranding } from '../store/branding'

// The name in the top-left corner. A deployment that has been through the
// setup wizard shows its own logo and name; one that has not falls back to the
// SUB12 lockup, which is still the right answer for sub12.io itself.
//
// A logo is drawn *instead of* the wordmark rather than beside it — a club
// crest with "SUB12" welded to its side reads as a co-brand nobody agreed to.
// The project's own attribution lives in the footer (see PoweredBy), where it
// is a statement about the software rather than about the club.
export function SiteMark({ className = '' }: { className?: string }) {
  const { site_name, logo_url } = useBranding()
  const branded = site_name && site_name !== 'SUB12'

  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={site_name}
        className={`h-9 max-w-[168px] w-auto object-contain ${className}`}
      />
    )
  }

  if (branded) {
    return (
      <span
        className={`block max-w-[168px] truncate text-2xl font-bold leading-none text-primary ${className}`}
        style={{ fontFamily: 'var(--serif)' }}
        title={site_name}
      >
        {site_name}
      </span>
    )
  }

  return <Sub12BrandLockup variant="compact" className={className} />
}
