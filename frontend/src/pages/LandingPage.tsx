import { Link } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarRange,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Gauge,
  ImageUp,
  LineChart,
  Medal,
  NotebookPen,
  Radar,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  Target,
  Trophy,
  Users2,
} from 'lucide-react'
import { CornerMark } from '../components/CornerMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { useThemeStore } from '../store/theme'

type SectionHeaderProps = {
  eyebrow: string
  title: string
  description: string
  align?: 'left' | 'center'
}

type SurfaceCardProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

type FeaturePoint = {
  title: string
  description: string
}

const workflowSteps = [
  {
    icon: Crosshair,
    step: '01',
    title: 'Build your rifle and pellet record',
    description:
      'Store the rifle, pellet, head size, batch code, and setup details once so every test and score card stays traceable.',
  },
  {
    icon: ImageUp,
    step: '02',
    title: 'Log real sessions from the range',
    description:
      'Capture target photos, multiple groups, distances, chrono figures, weather, and notes while the session is still fresh.',
  },
  {
    icon: ScanLine,
    step: '03',
    title: 'Measure and compare repeat performance',
    description:
      'Review best group, average group, and confidence instead of chasing one lucky card or one clean target.',
  },
  {
    icon: Trophy,
    step: '04',
    title: 'Turn private data into better decisions',
    description:
      'Use the same record for trends, pellet selection, club standings, and league submissions without rebuilding it elsewhere.',
  },
] as const

const trustPoints = [
  'Purpose-built for sub-12 air rifle tracking',
  'Works on phone, tablet, and desktop',
  'No ad clutter around your data',
  'Built around serious range and club workflows',
] as const

const comparisonRows = [
  {
    feature: 'Rifle, pellet, and batch traceability',
    notebook: 'Easy to lose or abbreviate',
    spreadsheet: 'Manual and inconsistent',
    sub12: 'Captured on every session and score card',
  },
  {
    feature: 'Measured target images',
    notebook: 'Not possible',
    spreadsheet: 'Lives in separate folders',
    sub12: 'Stored with the actual target and result',
  },
  {
    feature: 'Best group vs repeatable average',
    notebook: 'Manual maths',
    spreadsheet: 'Formula-heavy and brittle',
    sub12: 'Built in across repeated groups and sessions',
  },
  {
    feature: 'Conditions and chrono context',
    notebook: 'Usually partial',
    spreadsheet: 'Time-consuming to maintain',
    sub12: 'Logged alongside the performance data',
  },
  {
    feature: 'Trend analysis over time',
    notebook: 'Hard to see',
    spreadsheet: 'Possible but awkward on mobile',
    sub12: 'Ready by rifle, pellet, and date range',
  },
  {
    feature: 'Clubs and leagues',
    notebook: 'Separate admin work',
    spreadsheet: 'Version control headache',
    sub12: 'Join codes, standings, rounds, and score verification',
  },
] as const

const pelletTestingPoints: FeaturePoint[] = [
  {
    title: 'Test the full setup, not just the pellet name',
    description:
      'Tie every result to rifle, pellet, head size, batch, distance, and session conditions so comparisons stay honest.',
  },
  {
    title: 'Measure targets with evidence attached',
    description:
      'Keep the target photo, group size in mm and MOA, and the annotated review in the same record for later scrutiny.',
  },
  {
    title: 'Trust repeat sessions more than one standout target',
    description:
      'Review best group, session average, and confidence level so the winning pellet is the one that keeps performing.',
  },
  {
    title: 'Compare tins, batches, and combinations cleanly',
    description:
      'Use head-to-head comparison, combo analytics, and batch reporting to find what actually holds together over time.',
  },
] as const

const groupAnalysisPoints: FeaturePoint[] = [
  {
    title: 'Multiple groups in one session',
    description:
      'Record several groups against the same conditions to see whether a setup is genuinely stable or just produced one clean cluster.',
  },
  {
    title: 'Manual control when the paper gets messy',
    description:
      'Use assisted detection when the image is clean, then correct measurements manually when tears, shadow, or ragged holes need judgement.',
  },
  {
    title: 'Review group size in context',
    description:
      'Look at best, average, and spread together so you can separate true improvement from noise and target-by-target variance.',
  },
  {
    title: 'Keep every measured image for later review',
    description:
      'Useful when checking scope changes, pellet swaps, bench setup changes, or club disputes after the shooting is done.',
  },
] as const

const analyticsCards = [
  {
    icon: LineChart,
    title: 'Rolling form, not vanity metrics',
    description:
      'See performance over time by rifle, pellet, and date range so you can tell whether a change helped for one session or for the next ten.',
  },
  {
    icon: Radar,
    title: 'Combo ranking with context',
    description:
      'Compare rifle and pellet combinations by best group, average group, confidence, and test volume before changing your setup.',
  },
  {
    icon: BarChart3,
    title: 'Scores and X-counts in the same view',
    description:
      'Connect score cards with equipment and trends to see whether smaller groups are actually turning into better cards.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Conditions-aware review',
    description:
      'Use notes and environmental context to understand why a pellet only shines indoors, or why a setup fades in wind.',
  },
] as const

const clubLeagueCards = [
  {
    icon: Users2,
    title: 'For shooters',
    points: [
      'Submit scores to leagues without duplicating the session elsewhere.',
      'Track club standing, personal bests, and current form in the same account.',
      'Keep your personal testing record while still taking part in shared competition.',
    ],
  },
  {
    icon: CalendarRange,
    title: 'For organisers',
    points: [
      'Run seasons, rounds, standings, and membership from one clean workflow.',
      'Use join codes, member management, and score verification to reduce admin chase-up.',
      'Move away from message threads and spreadsheet tabs as the league grows.',
    ],
  },
] as const

const testimonials = [
  {
    quote:
      'I can finally see which pellet keeps its average tight across repeated sessions, not just which one won a single afternoon.',
    role: 'FT shooter',
    context: 'Pellet testing',
  },
  {
    quote:
      'The target image and the measurement stay together, so I can review the group properly later instead of trusting memory.',
    role: 'Bench testing workflow',
    context: 'Group analysis',
  },
  {
    quote:
      'League admin is cleaner when rounds, submissions, and standings live in one place instead of three spreadsheets and a chat thread.',
    role: 'Club secretary',
    context: 'League workflow',
  },
] as const

function SectionHeader({ eyebrow, title, description, align = 'left' }: SectionHeaderProps) {
  const centered = align === 'center'

  return (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--brass)]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-secondary sm:text-lg">{description}</p>
    </div>
  )
}

function SurfaceCard({ children, className = '', style }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-[28px] border border-subtle bg-surface p-6 shadow-[0_22px_80px_rgba(15,15,15,0.08)] ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

function FeatureList({ items }: { items: FeaturePoint[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.title} className="flex gap-4 rounded-2xl border border-subtle bg-surface-hover p-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
            <Check size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-secondary">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function HeroMockup() {
  const mockChartStyle = {
    backgroundImage:
      'linear-gradient(to right, rgba(184,136,44,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(184,136,44,0.08) 1px, transparent 1px)',
    backgroundSize: '36px 36px',
  } satisfies CSSProperties

  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <div className="absolute -inset-6 rounded-[36px] bg-[radial-gradient(circle_at_35%_25%,rgba(184,136,44,0.16),transparent_60%)] blur-3xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-[var(--brass)]/20 bg-surface shadow-[0_28px_90px_rgba(15,15,15,0.18)]">
        <div className="flex items-center gap-2 border-b border-subtle bg-[linear-gradient(90deg,rgba(184,136,44,0.10),transparent)] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--brass)]/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--brass)]/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--brass)]/18" />
          <div className="ml-3 rounded-full border border-subtle px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted">
            Air Arms S510 / JSB Exact 8.44 / 45m
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
            <div className="rounded-[24px] border border-subtle bg-page p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Performance Overview</p>
                  <h3 className="mt-2 text-lg font-semibold text-primary">Repeatable improvement, not guesswork</h3>
                </div>
                <div className="rounded-full border border-[var(--brass)]/20 bg-[var(--brass)]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                  7 sessions
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Best Group</p>
                  <p className="mt-2 font-mono text-xl font-semibold text-[var(--brass)]">7.82mm</p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Average</p>
                  <p className="mt-2 font-mono text-xl font-semibold text-primary">9.64mm</p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Confidence</p>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary">High</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-subtle bg-surface">
                <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Group Trend</p>
                    <p className="mt-1 text-sm text-secondary">Best session value by date</p>
                  </div>
                  <div className="rounded-full bg-[var(--brass)]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                    Down 1.8mm
                  </div>
                </div>

                <div className="relative h-44 p-4" style={mockChartStyle}>
                  <svg viewBox="0 0 320 160" className="h-full w-full">
                    <defs>
                      <linearGradient id="sub12-chart-line" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="rgba(184,136,44,0.65)" />
                        <stop offset="100%" stopColor="rgba(184,136,44,1)" />
                      </linearGradient>
                    </defs>
                    <path d="M18 110 L62 106 L106 94 L150 88 L194 72 L238 78 L282 52" fill="none" stroke="url(#sub12-chart-line)" strokeWidth="4" strokeLinecap="round" />
                    <path d="M18 110 L62 106 L106 94 L150 88 L194 72 L238 78 L282 52 L282 140 L18 140 Z" fill="rgba(184,136,44,0.10)" />
                    {[18, 62, 106, 150, 194, 238, 282].map((x, index) => {
                      const y = [110, 106, 94, 88, 72, 78, 52][index]
                      return (
                        <circle key={x} cx={x} cy={y} r="5" fill="var(--surface)" stroke="rgba(184,136,44,0.9)" strokeWidth="3" />
                      )
                    })}
                  </svg>
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted">
                    <span>Jan</span>
                    <span>Mar</span>
                    <span>Apr</span>
                    <span>May</span>
                    <span>Jun</span>
                    <span>Jul</span>
                    <span>Aug</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-subtle bg-page p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Winning Pellet</p>
                <div className="mt-4 rounded-[22px] border border-[var(--brass)]/20 bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-primary">JSB Exact 8.44</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">Batch A21 / 4.52 head</p>
                    </div>
                    <div className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                      Ranked #1
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Average group</span>
                      <span className="font-mono text-primary">9.64mm</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Measured groups</span>
                      <span className="font-mono text-primary">42</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Confidence badge</span>
                      <span className="font-semibold uppercase tracking-[0.14em] text-[var(--brass)]">High</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-subtle bg-page p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">League Snapshot</p>
                <div className="mt-4 rounded-[22px] border border-subtle bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
                      <Medal size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-primary">Summer Postal League</p>
                      <p className="text-xs text-secondary">Round 5 submitted and pending verification</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-subtle bg-page px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Standing</p>
                      <p className="mt-2 font-mono text-lg font-semibold text-primary">3rd</p>
                    </div>
                    <div className="rounded-2xl border border-subtle bg-page px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Best Card</p>
                      <p className="mt-2 font-mono text-lg font-semibold text-primary">247.4</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
            <div className="rounded-[24px] border border-subtle bg-page p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Latest Measured Target</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="relative overflow-hidden rounded-[20px] border border-subtle bg-surface p-4">
                  <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[var(--brass)]/10 blur-2xl" />
                  <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border border-[var(--brass)]/25 bg-page">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-subtle">
                      <div className="relative h-8 w-8 rounded-full border border-[var(--brass)]/30">
                        <span className="absolute left-[8px] top-[7px] h-1.5 w-1.5 rounded-full bg-[var(--brass)]" />
                        <span className="absolute left-[14px] top-[11px] h-1.5 w-1.5 rounded-full bg-[var(--brass)]" />
                        <span className="absolute left-[10px] top-[16px] h-1.5 w-1.5 rounded-full bg-[var(--brass)]" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-[20px] border border-subtle bg-surface px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Measured</p>
                    <p className="mt-2 font-mono text-lg font-semibold text-primary">8.31mm</p>
                  </div>
                  <div className="rounded-[20px] border border-subtle bg-surface px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Shots</p>
                    <p className="mt-2 font-mono text-lg font-semibold text-primary">5</p>
                  </div>
                  <div className="rounded-[20px] border border-subtle bg-surface px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Scale</p>
                    <p className="mt-2 font-mono text-lg font-semibold text-primary">4.50mm</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-subtle bg-page p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Why The Setup Won</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-subtle bg-surface p-4">
                  <Gauge size={18} className="text-[var(--brass)]" />
                  <p className="mt-3 text-sm font-semibold text-primary">Stable average</p>
                  <p className="mt-1 text-xs leading-5 text-secondary">Held under 10mm across repeated sessions.</p>
                </div>
                <div className="rounded-[20px] border border-subtle bg-surface p-4">
                  <Activity size={18} className="text-[var(--brass)]" />
                  <p className="mt-3 text-sm font-semibold text-primary">Useful sample size</p>
                  <p className="mt-1 text-xs leading-5 text-secondary">Enough measured groups to trust the ranking.</p>
                </div>
                <div className="rounded-[20px] border border-subtle bg-surface p-4">
                  <ShieldCheck size={18} className="text-[var(--brass)]" />
                  <p className="mt-3 text-sm font-semibold text-primary">Conditions logged</p>
                  <p className="mt-1 text-xs leading-5 text-secondary">Indoor and outdoor notes stay attached to the result.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const theme = useThemeStore((state) => state.theme)
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="min-h-screen bg-page">
      <CornerMark className="left-5 top-5 text-muted" />
      <CornerMark className="right-5 top-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      <header className="sticky top-0 z-50 border-b border-subtle bg-nav backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3">
          <img src={isDark ? '/logo-horizontal-dark.svg' : '/logo-horizontal-light.svg'} alt="SUB12" className="h-8 w-auto" />
          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#how-it-works" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              How it works
            </a>
            <a href="#pellet-testing" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Pellet testing
            </a>
            <a href="#analytics" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Analytics
            </a>
            <a href="#clubs-leagues" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Clubs and leagues
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="inline-flex text-sm font-medium uppercase tracking-[0.16em] text-[var(--brass)] transition-opacity hover:opacity-80">
              Sign In
            </Link>
            <Link to="/register" className="inline-flex items-center rounded-lg bg-[var(--brass)] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-inverse transition-all hover:-translate-y-0.5 hover:opacity-90">
              Start Tracking
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:pt-18 lg:pb-28 lg:pt-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(184,136,44,0.08),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(184,136,44,0.05),transparent_32%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brass)]/20 bg-[var(--brass)]/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">
                <Crosshair size={13} />
                For serious sub-12 air rifle shooters
              </div>
              <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-primary sm:text-6xl lg:text-7xl">
                Know which setup really improves your shooting.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-secondary sm:text-xl">
                SUB12 turns pellet testing, target measurement, score tracking, and league admin into one precise shooting record,
                so you can see real improvement and keep the setups that actually work.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brass)] px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-inverse transition-all hover:-translate-y-0.5 hover:opacity-90">
                  Track Your First Session
                  <ArrowRight size={16} />
                </Link>
                <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-xl border border-subtle px-6 py-4 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]">
                  See How SUB12 Works
                  <ChevronRight size={16} />
                </a>
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                Free to start. No ads. Built for range work, club nights, and proper league tracking.
              </p>
            </div>

            <HeroMockup />
          </div>
        </section>

        <section className="border-y border-subtle bg-surface px-4 py-5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustPoints.map((point) => (
              <div key={point} className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
                  <Check size={12} />
                </span>
                {point}
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="How It Works"
              title="From target photo to better equipment decisions"
              description="SUB12 is built around the actual sequence serious shooters follow: set up the rifle, log the session properly, measure the target, then compare results over time."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-4">
              {workflowSteps.map(({ icon: Icon, step, title, description }) => (
                <SurfaceCard key={step} className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brass)]/12 text-[var(--brass)]">
                      <Icon size={20} />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{step}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-primary">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-secondary">{description}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-subtle bg-surface px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Why SUB12"
              title="More useful than a notebook. More practical than a spreadsheet."
              description="Notebooks are quick, spreadsheets are powerful, and both break down once you want target images, trend analysis, pellet ranking, and club workflow in one place."
              align="center"
            />

            <SurfaceCard className="mt-12 overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-subtle bg-page">
                      <th className="px-5 py-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">What matters</th>
                      <th className="px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                          <NotebookPen size={16} className="text-[var(--brass)]" />
                          Notebook
                        </div>
                      </th>
                      <th className="px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                          <TableProperties size={16} className="text-[var(--brass)]" />
                          Spreadsheet
                        </div>
                      </th>
                      <th className="px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                          <Target size={16} className="text-[var(--brass)]" />
                          SUB12
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.feature} className="border-b border-subtle last:border-b-0">
                        <td className="px-5 py-4 text-sm font-medium text-primary">{row.feature}</td>
                        <td className="px-5 py-4 text-sm text-secondary">{row.notebook}</td>
                        <td className="px-5 py-4 text-sm text-secondary">{row.spreadsheet}</td>
                        <td className="px-5 py-4 text-sm font-medium text-primary">{row.sub12}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          </div>
        </section>

        <section id="pellet-testing" className="px-4 py-20 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <div>
              <SectionHeader
                eyebrow="Pellet Testing"
                title="Pellet testing with enough depth to trust the result"
                description="When a shooter says one pellet works better, the question is always: under what rifle, which batch, how many groups, and over how many sessions? SUB12 keeps the answer attached to the result."
              />

              <div className="mt-8">
                <FeatureList items={pelletTestingPoints} />
              </div>
            </div>

            <div className="grid gap-5">
              <SurfaceCard className="rounded-[28px] p-0">
                <div className="border-b border-subtle px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Pellet Test Detail</p>
                  <h3 className="mt-2 text-2xl font-semibold text-primary">Know why a pellet wins, not just that it won</h3>
                </div>

                <div className="grid gap-5 p-6 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <div className="rounded-[22px] border border-subtle bg-page p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Setup</p>
                          <p className="mt-2 text-sm font-semibold text-primary">TX200 MkIII / JSB Exact 8.44 / Batch A21</p>
                        </div>
                        <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                          Ranked #1
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[20px] border border-subtle bg-surface p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Best</p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-[var(--brass)]">7.82mm</p>
                        <p className="mt-1 text-xs text-secondary">Smallest measured group</p>
                      </div>
                      <div className="rounded-[20px] border border-subtle bg-surface p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Average</p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-primary">9.64mm</p>
                        <p className="mt-1 text-xs text-secondary">Across repeated groups</p>
                      </div>
                      <div className="rounded-[20px] border border-subtle bg-surface p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Measured Groups</p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-primary">42</p>
                        <p className="mt-1 text-xs text-secondary">Across 7 sessions</p>
                      </div>
                      <div className="rounded-[20px] border border-subtle bg-surface p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Confidence</p>
                        <p className="mt-2 text-lg font-semibold uppercase tracking-[0.14em] text-primary">High</p>
                        <p className="mt-1 text-xs text-secondary">Enough evidence to back the choice</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Data kept with the result</p>
                    <div className="mt-4 space-y-3">
                      {[
                        'Distance, chrono, temperature, humidity, and wind',
                        'Target photos with measured group data in mm and MOA',
                        'Session notes, bench setup, scope, and rifle details',
                        'Batch or lot analysis when one tin clearly behaves differently',
                      ].map((line) => (
                        <div key={line} className="flex gap-3 rounded-2xl border border-subtle bg-surface p-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
                            <Check size={14} />
                          </div>
                          <p className="text-sm leading-6 text-secondary">{line}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </div>
          </div>
        </section>

        <section className="border-y border-subtle bg-surface px-4 py-20 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-start">
            <div className="order-2 lg:order-1">
              <SurfaceCard className="rounded-[28px] p-0">
                <div className="border-b border-subtle px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Group Analysis</p>
                  <h3 className="mt-2 text-2xl font-semibold text-primary">See the group, the context, and the trend line</h3>
                </div>

                <div className="grid gap-5 p-6 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Measured Target</p>
                    <div className="mt-4 flex h-[240px] items-center justify-center rounded-[24px] border border-subtle bg-surface">
                      <div className="relative flex h-[170px] w-[170px] items-center justify-center rounded-full border border-[var(--brass)]/20">
                        <div className="absolute h-[110px] w-[110px] rounded-full border border-subtle" />
                        <div className="absolute h-[56px] w-[56px] rounded-full border border-[var(--brass)]/25" />
                        {[
                          'left-[73px] top-[62px]',
                          'left-[84px] top-[68px]',
                          'left-[79px] top-[79px]',
                          'left-[90px] top-[84px]',
                          'left-[74px] top-[92px]',
                        ].map((position) => (
                          <span
                            key={position}
                            className={`absolute h-2.5 w-2.5 rounded-full bg-[var(--brass)] shadow-[0_0_0_3px_rgba(184,136,44,0.14)] ${position}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-subtle bg-page p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Session Summary</p>
                          <p className="mt-2 text-lg font-semibold text-primary">One image, three decisions</p>
                        </div>
                        <Crosshair size={18} className="text-[var(--brass)]" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Best</p>
                          <p className="mt-2 font-mono text-lg font-semibold text-[var(--brass)]">8.31mm</p>
                        </div>
                        <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Average</p>
                          <p className="mt-2 font-mono text-lg font-semibold text-primary">10.02mm</p>
                        </div>
                        <div className="rounded-2xl border border-subtle bg-surface px-3 py-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Spread</p>
                          <p className="mt-2 font-mono text-lg font-semibold text-primary">1.71mm</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-subtle bg-page p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Why it matters</p>
                      <div className="mt-4 space-y-3">
                        {[
                          'A single tiny group is useful, but the session average tells you whether the setup is repeatable.',
                          'The measured image lets you review exactly what happened if the result looks too good or too poor.',
                          'Keeping best, average, and variability together exposes setups that only look good in isolated cases.',
                        ].map((line) => (
                          <div key={line} className="flex gap-3 rounded-2xl border border-subtle bg-surface p-3">
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brass)]" />
                            <p className="text-sm leading-6 text-secondary">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <div className="order-1 lg:order-2">
              <SectionHeader
                eyebrow="Group Analysis"
                title="Group analysis that separates a lucky card from a repeatable setup"
                description="You need more than a group number on its own. SUB12 ties the measurement to the target image, the shot count, the session, and the wider trend so you can judge the result properly."
              />

              <div className="mt-8">
                <FeatureList items={groupAnalysisPoints} />
              </div>
            </div>
          </div>
        </section>

        <section id="analytics" className="px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Performance Analytics"
              title="Statistics that feel like shooting analysis, not dashboard filler"
              description="SUB12 makes the numbers useful: performance by rifle, by pellet, by date range, and by confidence level, with enough context to decide what should change next."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <SurfaceCard className="rounded-[28px] p-0">
                <div className="border-b border-subtle px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Analytics Snapshot</p>
                  <h3 className="mt-2 text-2xl font-semibold text-primary">Your performance record should answer practical questions</h3>
                </div>

                <div className="grid gap-5 p-6 md:grid-cols-2">
                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Rolling 10-card average</p>
                    <p className="mt-3 font-mono text-3xl font-semibold text-primary">243.6</p>
                    <div className="mt-4 h-2 rounded-full bg-surface">
                      <div className="h-2 w-[76%] rounded-full bg-[var(--brass)]" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-secondary">Shows whether recent form is genuinely moving, not just your all-time best.</p>
                  </div>

                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">X-count trend</p>
                    <p className="mt-3 font-mono text-3xl font-semibold text-primary">+14%</p>
                    <div className="mt-4 grid grid-cols-7 gap-1">
                      {[32, 46, 40, 58, 61, 55, 70].map((height, index) => (
                        <div key={`${height}-${index}`} className="flex h-16 items-end">
                          <span className="w-full rounded-t bg-[var(--brass)]/70" style={{ height }} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-secondary">Useful when tighter groups are starting to turn into cleaner cards.</p>
                  </div>

                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Best rifle and pellet combo</p>
                    <p className="mt-3 text-lg font-semibold text-primary">S510 + JSB Exact 8.44</p>
                    <p className="mt-2 text-sm leading-6 text-secondary">Ranked on average group, test volume, and confidence instead of one standout result.</p>
                  </div>

                  <div className="rounded-[24px] border border-subtle bg-page p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">What changed after setup work</p>
                    <p className="mt-3 text-lg font-semibold text-primary">Regulator service cut average group by 0.9mm</p>
                    <p className="mt-2 text-sm leading-6 text-secondary">Exactly the kind of cause-and-effect trend a serious shooter wants to confirm.</p>
                  </div>
                </div>
              </SurfaceCard>

              <div className="grid gap-5">
                {analyticsCards.map(({ icon: Icon, title, description }) => (
                  <SurfaceCard key={title} className="rounded-[24px] p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brass)]/12 text-[var(--brass)]">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-primary">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-secondary">{description}</p>
                  </SurfaceCard>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="clubs-leagues" className="border-y border-subtle bg-surface px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Clubs And Leagues"
              title="Strong for personal analysis. Strong enough for organised shooting."
              description="SUB12 is not only a private shooting log. It also gives clubs and leagues a cleaner way to run rounds, standings, score submissions, and member management without losing the shooter-focused detail."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <SurfaceCard className="rounded-[28px] p-0">
                <div className="border-b border-subtle px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">League Workflow</p>
                  <h3 className="mt-2 text-2xl font-semibold text-primary">Less admin drag. Better visibility for everyone.</h3>
                </div>

                <div className="grid gap-5 p-6 md:grid-cols-2">
                  {clubLeagueCards.map(({ icon: Icon, title, points }) => (
                    <div key={title} className="rounded-[24px] border border-subtle bg-page p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brass)]/12 text-[var(--brass)]">
                          <Icon size={20} />
                        </div>
                        <h4 className="text-lg font-semibold text-primary">{title}</h4>
                      </div>
                      <div className="mt-5 space-y-3">
                        {points.map((point) => (
                          <div key={point} className="flex gap-3">
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brass)]" />
                            <p className="text-sm leading-6 text-secondary">{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard className="rounded-[28px] p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">What it replaces</p>
                <div className="mt-5 space-y-3">
                  {[
                    'Separate score sheets, message threads, and spreadsheet versions.',
                    'Repeated data entry when a shooter already logged the session privately.',
                    'League rounds that depend on one person chasing submissions manually.',
                    'Club standing updates that lag behind what shooters are actually doing.',
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-3 rounded-2xl border border-subtle bg-page p-4">
                      <Clock3 size={16} className="mt-1 shrink-0 text-[var(--brass)]" />
                      <p className="text-sm leading-6 text-secondary">{line}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-[var(--brass)]/20 bg-[var(--brass)]/8 p-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--brass)]">Practical outcome</p>
                  <p className="mt-3 text-lg font-semibold text-primary">
                    Shooters keep one accurate record. Organisers get cleaner rounds, clearer standings, and less manual admin.
                  </p>
                </div>
              </SurfaceCard>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Shooter Feedback"
              title="The kind of feedback serious shooters care about"
              description="Structured like range-side proof points rather than generic praise, because what matters is whether the platform helps you test properly, track improvement, and reduce admin noise."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {testimonials.map(({ quote, role, context }) => (
                <SurfaceCard key={quote} className="rounded-[24px] p-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full bg-[var(--brass)]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                      {context}
                    </span>
                    <ShieldCheck size={16} className="text-[var(--brass)]" />
                  </div>
                  <p className="mt-5 text-lg leading-8 text-primary">&ldquo;{quote}&rdquo;</p>
                  <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{role}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-subtle px-4 py-20 lg:py-28">
          <div className="mx-auto max-w-5xl">
            <SurfaceCard
              className="rounded-[32px] p-8 sm:p-10"
              style={{
                backgroundColor: 'var(--surface)',
                backgroundImage: 'linear-gradient(135deg, rgba(184,136,44,0.10), transparent 45%)',
              }}
            >
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--brass)]">Final Call</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                  Build a shooting record that tells you what actually works.
                </h2>
                <p className="mt-4 text-base leading-7 text-secondary sm:text-lg">
                  If you care about repeatable groups, trustworthy pellet choice, and cleaner club or league workflow, SUB12 gives you one proper place to track it.
                </p>

                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brass)] px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-inverse transition-all hover:-translate-y-0.5 hover:opacity-90">
                    Start Tracking For Free
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-subtle px-6 py-4 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]">
                    Sign In
                  </Link>
                </div>

                <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted">
                  Start with pellet testing, build your score history, and grow into clubs and leagues when you need them.
                </p>
              </div>
            </SurfaceCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-subtle py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">SUB12 - Precision shooting platform</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">&copy; 2025 SUB12. Built around shooter workflows.</p>
        </div>
      </footer>
    </div>
  )
}
