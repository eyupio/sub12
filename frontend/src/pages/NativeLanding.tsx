import { Link } from '@tanstack/react-router'
import { ArrowRight, Crosshair } from 'lucide-react'

// The native app's front door. Inside the Capacitor shell the marketing site
// is the wrong first screen — download links, a comparison table and a
// desktop-length scroll read as a wrapped web page rather than an app — so a
// signed-out visitor gets this instead: the brand, a coming-soon note for the
// full mobile experience, and the two actions that matter in thumb reach.
// Web visitors keep the full LandingPage.
export default function NativeLanding() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-page">
      {/* Same scope-reticle vignette as the auth screens this leads into. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(120vmin,900px)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.55]"
        style={{
          background:
            'radial-gradient(circle, transparent 0 28%, var(--brass-dim) 28% calc(28% + 1px), transparent calc(28% + 1px) 44%, var(--brass-dim) 44% calc(44% + 1px), transparent calc(44% + 1px) 62%, var(--brass-dim) 62% calc(62% + 1px), transparent calc(62% + 1px))',
          maskImage: 'radial-gradient(circle, #000 30%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 30%, transparent 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(90vmin,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, var(--brass-glow) 0%, transparent 65%)' }}
      />

      <main className="u-stagger relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="flex items-baseline leading-none" style={{ fontFamily: 'var(--serif)' }}>
          <span className="text-6xl font-bold tracking-normal text-primary">SUB</span>
          <span className="text-4xl font-bold tracking-normal" style={{ color: 'var(--gold)' }}>12</span>
        </p>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Precision shooting, properly tracked
        </p>

        <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[var(--brass)]/25 bg-[var(--brass)]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brass)]">
          <Crosshair size={13} />
          Coming soon
        </div>
        <h1 className="mt-5 max-w-sm text-3xl font-semibold leading-tight tracking-tight text-primary">
          The full SUB12 mobile experience is coming soon.
        </h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-secondary">
          Pellet testing, measured targets, score cards, clubs and leagues are being tuned for
          this app. Already shooting with SUB12? Sign in and carry on where you left off.
        </p>
      </main>

      <div className="relative z-10 flex flex-col gap-3 px-6 pb-8 pt-4 animate-fade-in-up">
        <Link to="/login" className="btn btn-primary btn-lg u-sheen w-full">
          Sign in
          <ArrowRight size={16} />
        </Link>
        <Link to="/register" className="btn btn-secondary btn-lg w-full">
          Create an account
        </Link>
      </div>
    </div>
  )
}
