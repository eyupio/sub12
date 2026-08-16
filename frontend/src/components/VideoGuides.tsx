import { useEffect, useState } from 'react'
import { Clapperboard, Play, X } from 'lucide-react'
import {
  availableVideoGuides,
  formatGuideDuration,
  videoGuidePoster,
  videoGuideSrc,
  type VideoGuide,
} from '../catalog/videoGuides'

/**
 * The "Video guides" rail on /help: one card per recorded demo video, each
 * opening an in-page player. Renders nothing while no guide is available, so
 * the section can ship ahead of the recordings.
 */
export default function VideoGuides() {
  const [active, setActive] = useState<VideoGuide | null>(null)

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  if (availableVideoGuides.length === 0) return null

  return (
    <section
      aria-labelledby="video-guides-title"
      className="mb-5 rounded-lg border border-subtle bg-surface overflow-hidden"
    >
      <header className="flex items-center gap-1.5 px-4 py-3 border-b border-subtle bg-[var(--brass)]/[0.06]">
        <Clapperboard size={14} className="text-[var(--brass)]" />
        <h2 id="video-guides-title" className="t-section-title">Video guides</h2>
        <span className="ml-auto text-[11px] text-muted">Short recordings of the real app</span>
      </header>

      <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        {availableVideoGuides.map((guide) => (
          <li key={guide.slug}>
            <button
              onClick={() => setActive(guide)}
              className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-subtle text-left hover:border-[var(--brass)]/50 u-lift transition-colors"
            >
              <span className="relative block aspect-video w-full overflow-hidden bg-black/60">
                <img
                  src={videoGuidePoster(guide.slug)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-[var(--gold-soft)] backdrop-blur-sm">
                    <Play size={16} fill="currentColor" />
                  </span>
                </span>
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white u-tnum">
                  {formatGuideDuration(guide.durationS)}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brass)]">
                  {guide.kind === 'showcase' ? 'Showcase' : 'How-to'}
                </span>
                <span className="text-sm text-primary">{guide.title}</span>
                <span className="text-xs leading-relaxed text-muted">{guide.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 animate-fade-in"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-3xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="min-w-0 truncate text-sm font-medium text-white">{active.title}</h3>
              <button
                onClick={() => setActive(null)}
                aria-label="Close video"
                className="rounded p-1.5 text-white/70 hover:text-white u-press tap-target"
              >
                <X size={18} />
              </button>
            </div>
            {/* No captions track: the narration is burned into the frames as overlay text. */}
            <video
              src={videoGuideSrc(active.slug)}
              poster={videoGuidePoster(active.slug)}
              controls
              autoPlay
              playsInline
              className="w-full rounded-lg bg-black shadow-overlay"
            />
          </div>
        </div>
      )}
    </section>
  )
}
