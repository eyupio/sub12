import { Link } from '@tanstack/react-router'
import { ArrowRight, Crosshair, Target, Users2 } from 'lucide-react'

// The native app's front door. Inside the Capacitor shell the marketing site
// is the wrong first screen — download links, a comparison table and a
// desktop-length scroll read as a wrapped web page rather than an app — so a
// signed-out visitor gets this instead: the brand, what the app does in three
// lines, and the two actions that matter in thumb reach. Web visitors keep
// the full LandingPage.
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

        <h1 className="mt-12 max-w-sm text-3xl font-semibold leading-tight tracking-tight text-primary">
          Know which setup really improves your shooting.
        </h1>

        <div className="mt-8 w-full max-w-sm space-y-3 text-left">
          {[
            { icon: Target, text: 'Log 25-shot score cards at the firing line, even with no signal.' },
            { icon: Crosshair, text: 'Measure pellet groups from a photo and rank your setups on evidence.' },
            { icon: Users2, text: 'Shoot in clubs and leagues with verified scores and live standings.' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-subtle bg-surface/80 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
                <Icon size={17} />
              </span>
              <p className="text-sm leading-6 text-secondary">{text}</p>
            </div>
          ))}
        </div>
      </main>

      <div className="animate-fade-in-up relative z-10 mx-auto flex w-full max-w-sm flex-col gap-3 px-6 pb-8 pt-4">
        <Link to="/register" className="btn btn-primary btn-lg u-sheen w-full">
          Create an account
          <ArrowRight size={16} />
        </Link>
        <Link to="/login" className="btn btn-secondary btn-lg w-full">
          Sign in
        </Link>
      </div>
    </div>
  )
}
