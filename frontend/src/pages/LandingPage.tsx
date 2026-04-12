import { Link } from '@tanstack/react-router'
import { Target, Wind, Package, Trophy, BarChart3, Smartphone } from 'lucide-react'
import { useThemeStore } from '../store/theme'
import { CornerMark } from '../components/CornerMark'

const features = [
  {
    icon: Target,
    title: 'Score Tracking',
    description: 'Log 25-shot groups with per-shot scores and X-ring hits',
  },
  {
    icon: Wind,
    title: 'Match Conditions',
    description: 'Record wind, temperature, location, and gear for every card',
  },
  {
    icon: Package,
    title: 'Gear Management',
    description: 'Track your rifles and pellets with photos and specifications',
  },
  {
    icon: Trophy,
    title: 'Leagues & Competitions',
    description: 'Create or join leagues with seasons, standings, and leaderboards',
  },
  {
    icon: BarChart3,
    title: 'Statistics & Analytics',
    description: 'Personal bests, rifle-specific performance, and running averages',
  },
  {
    icon: Smartphone,
    title: 'Works Everywhere',
    description: 'Phone, tablet, or desktop — install as an app on any device',
  },
] as const

export default function LandingPage() {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="min-h-screen bg-page">
      <CornerMark className="top-5 left-5 text-muted" />
      <CornerMark className="top-5 right-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-nav backdrop-blur border-b border-subtle">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <img
            src={isDark ? '/logo-horizontal-dark.svg' : '/logo-horizontal-light.svg'}
            alt="SUB12"
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-[var(--brass)] hover:opacity-80 transition-opacity text-sm tracking-[0.15em] uppercase font-medium"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="bg-[var(--brass)] hover:opacity-90 text-inverse font-medium rounded py-2 px-5 transition-opacity text-sm tracking-[0.15em] uppercase"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center px-4 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <img
          src="/logo-primary-dark.svg"
          alt="SUB12"
          className="h-36 lg:h-48 w-auto"
        />
        <p className="mt-6 text-sm tracking-widest uppercase text-muted text-center max-w-md">
          Track scores. Compete in leagues. Own your data.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <Link
            to="/register"
            className="bg-[var(--brass)] hover:opacity-90 text-inverse font-medium rounded py-3 px-8 transition-opacity text-sm tracking-[0.15em] uppercase"
          >
            Create Free Account
          </Link>
          <Link
            to="/login"
            className="border border-subtle hover:border-[var(--brass)]/30 text-secondary font-medium rounded py-3 px-8 transition-colors text-sm tracking-[0.15em] uppercase"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section className="px-4 pb-20 lg:pb-28">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] tracking-widest uppercase text-muted text-center mb-6">
            Everything you need
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-surface border border-subtle rounded-lg p-4 lg:p-5 flex items-start gap-4"
              >
                <Icon size={20} className="text-[var(--brass)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-secondary font-medium tracking-wide">{title}</p>
                  <p className="text-[11px] text-muted tracking-wide mt-1">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────── */}
      <section className="px-4 pb-20 lg:pb-28 text-center">
        <p className="text-xl lg:text-2xl font-medium tracking-widest uppercase text-secondary">
          Ready to start tracking?
        </p>
        <p className="mt-3 text-sm tracking-widest uppercase text-muted">
          Free to use. No ads. Built for shooters.
        </p>
        <Link
          to="/register"
          className="inline-block mt-8 bg-[var(--brass)] hover:opacity-90 text-inverse font-medium rounded py-3 px-8 transition-opacity text-sm tracking-[0.15em] uppercase"
        >
          Get Started
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-subtle py-8 text-center">
        <p className="text-[11px] tracking-widest uppercase text-muted">
          SUB12 &mdash; UK Airgun Benchrest
        </p>
      </footer>
    </div>
  )
}
