import { useBranding } from '../store/branding'
import { sourceUrl } from '../utils/site'

// The attribution every deployment carries, however it has branded itself.
//
// Three things are bundled here because they are three halves of the same
// obligation and separating them is how one of them quietly goes missing:
//
//  - **Source** discharges AGPL-3.0 section 13, which obliges anyone running a
//    modified copy as a network service to offer its source to the people
//    using it over that network. A fork points VITE_SOURCE_URL at its own
//    repository rather than deleting the link.
//  - **SUB12** and **EyUp.io** say what the software is and who wrote it. A
//    self-hoster is welcome to put their club's name over the door; the
//    person using the site is still entitled to know what they are looking at.
//
// The names and URLs come from the backend's branding payload, which stamps
// them from constants rather than from the settings table — so there is no
// value an operator can save that removes them.
export function PoweredBy({ className = '' }: { className?: string }) {
  const { upstream } = useBranding()
  const linkCls = 'hover:text-[var(--brass)] transition-colors'

  return (
    <span className={`inline-flex flex-wrap items-baseline justify-center gap-x-1.5 opacity-70 ${className}`}>
      <span>Powered by</span>
      <a href={upstream.project_url} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {upstream.project_name}
      </a>
      <span aria-hidden>·</span>
      <span>by</span>
      <a href={upstream.vendor_url} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {upstream.vendor_name}
      </a>
      <span aria-hidden>·</span>
      <a href={sourceUrl()} target="_blank" rel="noopener noreferrer" className={linkCls}>
        Source
      </a>
    </span>
  )
}
