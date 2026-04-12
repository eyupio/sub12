import { Link } from '@tanstack/react-router'
import {
  Target, Package, Trophy, BarChart3, Smartphone, Users,
  TrendingUp, Layers, Rss, Award, Crosshair, Search,
} from 'lucide-react'
import { useThemeStore } from '../store/theme'
import { CornerMark } from '../components/CornerMark'
import { ThemeToggle } from '../components/ThemeToggle'

const newFeatures = [
  {
    icon: Search,
    title: 'AI Hole Detection',
    description: 'Upload a target photo. SUB12 detects every pellet hole, measures group size in millimetres, and tracks consistency across sessions.',
  },
  {
    icon: Layers,
    title: 'Combo Analytics',
    description: 'Cross-reference every rifle–pellet pairing by best group, average group, and consistency. Find what actually works.',
  },
  {
    icon: TrendingUp,
    title: 'Score Trends',
    description: 'Interactive weekly and monthly charts. Filter by rifle to see exactly where your progress is coming from.',
  },
  {
    icon: Users,
    title: 'Shooting Clubs',
    description: 'Create or join your local club. Club leaderboards, member standings, and a shared space for your shooting community.',
  },
  {
    icon: Rss,
    title: 'Activity Feed',
    description: 'Follow other shooters, celebrate their scores, and see what your community is achieving between sessions.',
  },
  {
    icon: Award,
    title: 'Achievements',
    description: 'Earn badges as you hit milestones — First Card, Century, Perfect Score, Sharpshooter, and more.',
  },
] as const

const coreFeatures = [
  {
    icon: Target,
    title: 'Score Cards',
    description: 'Log every 25-shot group with per-shot scores and X-ring hits. Gear, conditions, and location on every card.',
  },
  {
    icon: Crosshair,
    title: 'Pellet Testing',
    description: 'Systematic sessions with group measurements, confidence scoring, batch reports, and a public leaderboard.',
  },
  {
    icon: Trophy,
    title: 'Leagues',
    description: 'Create private leagues with seasons, rounds, and standings. Score verification and a full audit trail.',
  },
  {
    icon: Package,
    title: 'Gear Management',
    description: 'Catalogue rifles and pellets with photos. Link every score card to the exact gear you used.',
  },
  {
    icon: BarChart3,
    title: 'Statistics',
    description: 'Personal bests, per-rifle averages, X-count history, cards logged. Your data becomes your advantage.',
  },
  {
    icon: Smartphone,
    title: 'Works Everywhere',
    description: 'Install as an app on iOS, Android, or desktop. Works offline at the range with no signal.',
  },
] as const

const achievements = [
  { icon: Target,   label: 'First Card'    },
  { icon: BarChart3,label: 'Century'       },
  { icon: Award,    label: 'Perfect Score' },
  { icon: Search,   label: 'Sharp Eye'     },
  { icon: Crosshair,label: 'Sharpshooter'  },
  { icon: Trophy,   label: 'League Debut'  },
]

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
            <ThemeToggle />
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
      <section className="relative flex flex-col items-center justify-center px-4 pt-16 pb-20 lg:pt-24 lg:pb-28 overflow-hidden">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'linear-gradient(rgba(212,164,74,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212,164,74,0.06) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
          }}
          aria-hidden
        />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(212,164,74,0.06) 0%, transparent 65%)' }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-3xl">
          {/* New badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--brass)]"
            style={{ background: 'rgba(212,164,74,0.12)', border: '1px solid rgba(212,164,74,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brass)] animate-pulse" />
            New — Clubs, Pellet AI, Trends &amp; More
          </div>

          <img
            src={isDark ? '/logo-primary-dark.svg' : '/logo-primary-light.svg'}
            alt="SUB12"
            className="h-28 lg:h-36 w-auto"
          />

          <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight leading-[1.08] text-primary">
            Precision Shooting.{' '}
            <span className="text-[var(--brass)]">Tracked to the Millimetre.</span>
          </h1>

          <p className="text-base lg:text-lg text-muted max-w-xl leading-relaxed">
            Score cards, pellet testing with AI hole detection, leagues, clubs, and deep analytics.
            The complete companion for serious air rifle shooters.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Link
              to="/register"
              className="bg-[var(--brass)] hover:opacity-90 text-inverse font-semibold rounded-lg py-3.5 px-10 transition-all text-sm tracking-[0.14em] uppercase hover:-translate-y-0.5 hover:shadow-lg"
              style={{ '--tw-shadow-color': 'rgba(212,164,74,0.3)' } as React.CSSProperties}
            >
              Create Free Account
            </Link>
            <Link
              to="/login"
              className="border border-subtle hover:border-[var(--brass)]/40 hover:text-[var(--brass)] text-secondary font-medium rounded-lg py-3.5 px-10 transition-colors text-sm tracking-[0.14em] uppercase"
            >
              Sign In
            </Link>
          </div>
          <p className="text-[11px] text-muted tracking-widest uppercase -mt-1">
            Free forever &middot; No ads &middot; Your data, your way
          </p>
        </div>
      </section>

      {/* ── Trust bar ───────────────────────────────────── */}
      <div className="border-y border-subtle bg-surface py-4">
        <div className="max-w-3xl mx-auto px-4 flex flex-wrap justify-center gap-x-8 gap-y-2">
          {['Free to use, forever', 'No advertisements', 'Install on any device', 'Built by shooters, for shooters'].map(t => (
            <span key={t} className="flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase text-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--brass)]">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── New Features ────────────────────────────────── */}
      <section className="px-4 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] tracking-widest uppercase text-[var(--brass)] text-center mb-2">
            What&apos;s new
          </p>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-center text-primary mb-10">
            The platform just got a lot more powerful
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newFeatures.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="relative bg-surface border border-subtle rounded-xl p-5 hover:border-[var(--brass)]/30 transition-all group hover:-translate-y-0.5"
              >
                <div className="absolute top-4 right-4 text-[9px] font-semibold tracking-[0.15em] uppercase text-[var(--brass)] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(212,164,74,0.12)', border: '1px solid rgba(212,164,74,0.25)' }}>
                  New
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 text-[var(--brass)]"
                  style={{ background: 'rgba(212,164,74,0.12)', border: '1px solid rgba(212,164,74,0.2)' }}>
                  <Icon size={18} />
                </div>
                <p className="text-sm font-semibold text-primary mb-1.5">{title}</p>
                <p className="text-[12px] text-muted leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core Features ───────────────────────────────── */}
      <section className="px-4 pb-16 lg:pb-24 border-t border-subtle">
        <div className="max-w-5xl mx-auto pt-16">
          <p className="text-[11px] tracking-widest uppercase text-muted text-center mb-2">
            Everything you need
          </p>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-center text-primary mb-10">
            The complete shooting platform
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreFeatures.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-surface border border-subtle rounded-xl p-5 hover:border-[var(--brass)]/30 transition-all hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 text-[var(--brass)]"
                  style={{ background: 'rgba(212,164,74,0.10)', border: '1px solid rgba(212,164,74,0.18)' }}>
                  <Icon size={18} />
                </div>
                <p className="text-sm font-semibold text-primary mb-1.5">{title}</p>
                <p className="text-[12px] text-muted leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Achievements showcase ────────────────────────── */}
      <section className="px-4 py-16 border-t border-subtle bg-surface">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[11px] tracking-widest uppercase text-[var(--brass)] mb-2">Achievements</p>
          <h2 className="text-xl lg:text-2xl font-semibold tracking-tight text-primary mb-3">
            Hit milestones. Earn your badges.
          </h2>
          <p className="text-sm text-muted mb-8 max-w-md mx-auto leading-relaxed">
            Log consistently, shoot precisely, and watch your achievement collection grow.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {achievements.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[11px] tracking-[0.1em] uppercase font-medium text-[var(--brass)] hover:-translate-y-0.5 transition-transform"
                style={{ background: 'rgba(212,164,74,0.12)', border: '1px solid rgba(212,164,74,0.25)' }}
              >
                <Icon size={12} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────── */}
      <section className="px-4 py-20 lg:py-28 text-center border-t border-subtle">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--brass)] mb-6"
          style={{ background: 'rgba(212,164,74,0.10)', border: '1px solid rgba(212,164,74,0.22)' }}>
          Free to join — No credit card needed
        </div>
        <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-primary mb-4">
          Ready to shoot smarter?
        </h2>
        <p className="text-sm text-muted tracking-wide max-w-sm mx-auto mb-10 leading-relaxed">
          Join shooters who track every card, test every pellet, and know exactly where their performance stands.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Link
            to="/register"
            className="inline-block bg-[var(--brass)] hover:opacity-90 text-inverse font-semibold rounded-lg py-3.5 px-10 transition-all text-sm tracking-[0.14em] uppercase hover:-translate-y-0.5"
          >
            Create Your Free Account
          </Link>
          <Link
            to="/login"
            className="inline-block border border-subtle hover:border-[var(--brass)]/40 hover:text-[var(--brass)] text-secondary font-medium rounded-lg py-3.5 px-10 transition-colors text-sm tracking-[0.14em] uppercase"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-subtle py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-between items-center gap-4">
          <p className="text-[11px] tracking-widest uppercase text-muted">
            SUB12 &mdash; Precision Shooting Platform
          </p>
          <p className="text-[11px] tracking-widest uppercase text-muted">
            &copy; 2025 SUB12. Built by shooters.
          </p>
        </div>
      </footer>
    </div>
  )
}
