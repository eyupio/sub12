import { Outlet } from '@tanstack/react-router'

// The sign-in / register / reset screens are the first thing anyone sees, so
// they get a treatment of their own: a scope-reticle vignette over the page
// backdrop, with the form floating above it.
export default function AuthLayout() {
  return (
    <div className="relative min-h-screen bg-page overflow-hidden">
      {/* Concentric rings, faint enough to read as texture rather than an
          illustration. Purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(120vmin,900px)] aspect-square rounded-full opacity-[0.55]"
        style={{
          background:
            'radial-gradient(circle, transparent 0 28%, var(--brass-dim) 28% calc(28% + 1px), transparent calc(28% + 1px) 44%, var(--brass-dim) 44% calc(44% + 1px), transparent calc(44% + 1px) 62%, var(--brass-dim) 62% calc(62% + 1px), transparent calc(62% + 1px))',
          maskImage: 'radial-gradient(circle, #000 30%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 30%, transparent 72%)',
        }}
      />
      {/* Warm pool of light behind the form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vmin,640px)] aspect-square rounded-full"
        style={{ background: 'radial-gradient(circle, var(--brass-glow) 0%, transparent 65%)' }}
      />
      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  )
}
