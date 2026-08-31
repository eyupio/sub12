import { Link } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarRange,
  Check,
  ChevronRight,
  Clapperboard,
  Clock3,
  Crosshair,
  Gauge,
  GitPullRequest,
  LineChart,
  Medal,
  NotebookPen,
  Radar,
  ScanLine,
  Server,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  TableProperties,
  Target,
  Users2,
  WifiOff,
} from 'lucide-react'
import { CornerMark } from '../components/CornerMark'
import { Sub12BrandLockup } from '../components/Sub12BrandLockup'
import { ThemeToggle } from '../components/ThemeToggle'
import { sourceUrl } from '../utils/site'
import {
  availableVideoGuides,
  formatGuideDuration,
  videoGuidePoster,
  videoGuideSrc,
  type VideoGuide,
} from '../catalog/videoGuides'

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

const whyMeasureCards = [
  {
    icon: ShieldCheck,
    title: 'Remove subjective bias',
    description:
      'Eye-balling and memory reward lucky cards. Calibrated measurement of every group rewards the setup that actually repeats.',
  },
  {
    icon: Radar,
    title: 'Build comparable, auditable evidence',
    description:
      'Every shot is tied to the same photo, scale, range, batch, and conditions — so a surprising target can be re-checked later instead of trusted from memory.',
  },
  {
    icon: Gauge,
    title: 'Decide equipment with confidence, not feel',
    description:
      'Measured groups feed directly into pellet ranking, batch comparison, and setup-change validation — the decisions serious shooters refuse to guess at.',
  },
] as const

// The demo recordings, split by kind. `availableVideoGuides` is the single
// registry of what has actually been recorded and shipped, so a storyboarded
// video never leaves a dead player on the landing page.
const showcaseGuides = availableVideoGuides.filter((g) => g.kind === 'showcase')
const howToGuides = availableVideoGuides.filter((g) => g.kind === 'how-to')

const trustPoints = [
  'Purpose-built for sub-12 air rifle tracking',
  'Works on phone, tablet, and desktop',
  'No ad clutter around your data',
  'Free to use — no ads, no paywalls',
  'Open source — AGPL-3.0',
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

const imageAnalysisPoints: FeaturePoint[] = [
  {
    title: 'One measurement workflow across every group',
    description:
      'Apply the same image-analysis method to every target so repeatability is judged on consistent evidence, not a mix of methods.',
  },
  {
    title: 'Interpret best, average, and spread together',
    description:
      'Read smallest group, session average, and variability in one view to separate genuine gains from normal shot-to-shot noise.',
  },
  {
    title: 'Rank pellet setups by repeatable outcomes',
    description:
      'Compare rifle and pellet combinations by measured results so your shortlist is driven by repeat performance, not brand preference.',
  },
  {
    title: 'Compare batches and head sizes side by side',
    description:
      'Spot tins or batch codes that drift from baseline and keep only combinations that stay tight across real sessions.',
  },
  {
    title: 'Keep measured-image proof attached',
    description:
      'Every reviewed target stays linked to its measurement overlay, so later validation, coaching, and score verification are straightforward.',
  },
  {
    title: 'Correct edge cases with manual judgement',
    description:
      'Use assisted detection when paper tears or shadow confuse auto-picking, then refine points without losing traceability.',
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
    title: 'Clubs for every community',
    points: [
      'Create or join a club, invite your shooters, and share a club identity with members.',
      'Club leaderboards, member standings, and activity sit alongside your personal record.',
      'Host leagues under a club so standings, rounds, and membership all live together.',
    ],
  },
  {
    icon: CalendarRange,
    title: 'Private or open leagues',
    points: [
      'Open leagues anyone can join, or private leagues gated by invite code or admin approval.',
      'Run seasons, rounds, standings, and membership from one clean workflow.',
      'Configure required image uploads, max submissions per round, and scoring rules per league.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Peer-verified score submissions',
    points: [
      'Require one or more peer confirmations before a score counts toward the standings.',
      'Amend or reject suspect cards with a reason — the change is logged to a full audit trail.',
      'Organisers spend less time chasing proof; shooters trust the final table.',
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

/**
 * One recording on the landing page. `preload="none"` matters here: the four
 * showcase files run to several MB each, so nothing is fetched until a visitor
 * presses play — the poster carries the section until then. No captions track;
 * the narration is burned into the frames as overlay text.
 */
function DemoVideo({ guide, featured = false }: { guide: VideoGuide; featured?: boolean }) {
  return (
    <figure className="flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface">
      <video
        src={videoGuideSrc(guide.slug)}
        poster={videoGuidePoster(guide.slug)}
        controls
        muted
        playsInline
        preload="none"
        aria-label={guide.title}
        className="aspect-video w-full bg-black object-cover"
      />
      <figcaption className={`flex flex-1 flex-col gap-1.5 p-4 ${featured ? 'sm:p-5' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brass)]">
            {guide.kind === 'showcase' ? 'Showcase' : 'How-to'}
          </span>
          <span className="text-[11px] text-muted u-tnum">{formatGuideDuration(guide.durationS)}</span>
        </div>
        <p className={`font-semibold text-primary ${featured ? 'text-lg' : 'text-base'}`}>{guide.title}</p>
        <p className="text-sm leading-relaxed text-secondary">{guide.blurb}</p>
      </figcaption>
    </figure>
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
          <div className="ml-3 min-w-0 truncate whitespace-nowrap rounded-full border border-subtle px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-muted sm:tracking-[0.18em]">
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
                <div className="shrink-0 whitespace-nowrap rounded-full border border-[var(--brass)]/20 bg-[var(--brass)]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
                  7 sessions
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Best Group</p>
                  <p className="mt-2 font-mono text-base font-semibold text-[var(--brass)] sm:text-xl">7.82<span className="text-xs">mm</span></p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Average</p>
                  <p className="mt-2 font-mono text-base font-semibold text-primary sm:text-xl">9.64<span className="text-xs">mm</span></p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Confidence</p>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary">High</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-subtle bg-surface">
                <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Group Trend</p>
                    <p className="mt-1 text-sm text-secondary">Best session value by date</p>
                  </div>
                  <div className="shrink-0 whitespace-nowrap rounded-full bg-[var(--brass)]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
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
                    <path d="M18 50 L62 54 L106 66 L150 72 L194 88 L238 82 L282 108" fill="none" stroke="url(#sub12-chart-line)" strokeWidth="4" strokeLinecap="round" />
                    <path d="M18 50 L62 54 L106 66 L150 72 L194 88 L238 82 L282 108 L282 140 L18 140 Z" fill="rgba(184,136,44,0.10)" />
                    {[18, 62, 106, 150, 194, 238, 282].map((x, index) => {
                      const y = [50, 54, 66, 72, 88, 82, 108][index]
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
                    <div className="shrink-0 whitespace-nowrap rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
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
                      <p className="mt-2 font-mono text-lg font-semibold text-primary">247</p>
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
  return (
    <div className="min-h-screen bg-page">
      <CornerMark className="left-5 top-5 text-muted" />
      <CornerMark className="right-5 top-5 text-muted" />
      <CornerMark className="bottom-5 left-5 text-muted" />
      <CornerMark className="bottom-5 right-5 text-muted" />

      <header className="sticky top-0 z-50 border-b border-subtle bg-nav backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3">
          <Link to="/" aria-label="SUB12 home" className="inline-flex items-center">
            <Sub12BrandLockup variant="compact" />
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#demos" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              See it in action
            </a>
            <a href="#image-analysis" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Image analysis
            </a>
            <a href="#analytics" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Trends & analytics
            </a>
            <a href="#get-the-app" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Get the app
            </a>
            <a href="#clubs-leagues" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Clubs and leagues
            </a>
            <a href="#open-source" className="text-sm tracking-wide text-muted transition-colors hover:text-secondary">
              Open source
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-[var(--brass)]/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brass)] transition-colors hover:border-[var(--brass)] hover:bg-[var(--brass)]/10 sm:px-5 sm:py-2.5 sm:text-sm sm:tracking-[0.16em]">
              Sign in
            </Link>
            <Link to="/register" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-[var(--brass)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-inverse transition-all hover:-translate-y-0.5 hover:opacity-90 sm:px-5 sm:py-2.5 sm:text-sm sm:tracking-[0.16em]">
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
              <Sub12BrandLockup className="mb-8" />
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brass)]/20 bg-[var(--brass)]/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">
                <Crosshair size={13} />
                For sub-12 air rifle shooters &mdash; beginners to professionals
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
                <a href="#demos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-subtle px-6 py-4 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]">
                  Watch SUB12 In Action
                  <ChevronRight size={16} />
                </a>
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                Free to use.{' '}
                <a href="#open-source" className="underline decoration-[var(--brass)]/40 underline-offset-2 transition-colors hover:text-[var(--brass)]">
                  Open source
                </a>
                . No ads. Built for range work, club nights, and proper league tracking.
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

        {showcaseGuides.length > 0 && (
          <section id="demos" className="px-4 py-20 lg:py-24">
            <div className="mx-auto max-w-7xl">
              <SectionHeader
                eyebrow="See it in action"
                title="Real recordings. Real cards."
                description="Short screen recordings of the app itself, narrated on screen. Nothing is mocked up and nothing is edited by hand — every clip is re-recorded from the live app whenever the screens change."
                align="center"
              />

              <div className="mt-12 grid gap-5 lg:grid-cols-2">
                {showcaseGuides.map((guide, i) => (
                  <DemoVideo key={guide.slug} guide={guide} featured={i === 0} />
                ))}
              </div>

              {howToGuides.length > 0 && (
                <>
                  <div className="mt-14 flex items-center gap-2">
                    <Clapperboard size={15} className="text-[var(--brass)]" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                      How-to guides
                    </h3>
                    <span className="text-xs text-muted">No account needed to watch</span>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {howToGuides.map((guide) => (
                      <DemoVideo key={guide.slug} guide={guide} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

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

        <section id="image-analysis" className="px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Image Analysis"
              title="From target photo to better equipment decisions"
              description="Measured-image evidence is what separates a lucky card from a repeatable setup. Every downstream feature — pellet ranking, trend analysis, score verification — is only as trustworthy as the measurement that fed it."
              align="center"
            />

            <div className="mt-14">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--brass)]">Why professionals measure</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-primary">What you stop guessing at, and what you start proving</h3>
              </div>

              <div className="mt-10 grid gap-5 md:grid-cols-3">
                {whyMeasureCards.map(({ icon: Icon, title, description }) => (
                  <SurfaceCard key={title} className="rounded-[24px] p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brass)]/12 text-[var(--brass)]">
                      <Icon size={20} />
                    </div>
                    <h4 className="mt-5 text-lg font-semibold text-primary">{title}</h4>
                    <p className="mt-3 text-sm leading-6 text-secondary">{description}</p>
                  </SurfaceCard>
                ))}
              </div>
            </div>

            <div className="mt-20">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--brass)]">How the measurement works</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-primary">One workflow, applied to every target</h3>
              </div>

              <div className="mt-10 grid gap-5 lg:grid-cols-5 md:grid-cols-2">
                <SurfaceCard className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">Step 01</span>
                    <Crosshair size={16} className="text-[var(--brass)]" />
                  </div>
                  <div className="mt-4 flex h-32 items-center justify-center rounded-[18px] border border-subtle bg-page">
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[var(--brass)]/25">
                      <div className="absolute h-16 w-16 rounded-full border border-subtle" />
                      <div className="absolute h-8 w-8 rounded-full border border-[var(--brass)]/35" />
                      <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--brass)] shadow-[0_0_0_4px_rgba(184,136,44,0.18)]" />
                    </div>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Capture a comparable test target</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary">Start each candidate pellet on the same target style so later ranking compares like with like.</p>
                </SurfaceCard>

                <SurfaceCard className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">Step 02</span>
                    <SlidersHorizontal size={16} className="text-[var(--brass)]" />
                  </div>
                  <div className="mt-4 flex h-32 items-center justify-center rounded-[18px] border border-subtle bg-page">
                    <div className="relative flex h-20 w-full max-w-[160px] items-center justify-center">
                      <span className="absolute left-2 h-3 w-3 rounded-full bg-[var(--brass)] shadow-[0_0_0_4px_rgba(184,136,44,0.18)]" />
                      <span className="absolute right-2 h-3 w-3 rounded-full bg-[var(--brass)] shadow-[0_0_0_4px_rgba(184,136,44,0.18)]" />
                      <span className="absolute left-4 right-4 h-px border-t border-dashed border-[var(--brass)]/55" />
                      <span className="relative -top-5 rounded-full border border-[var(--brass)]/25 bg-surface px-2 py-0.5 font-mono text-[10px] text-[var(--brass)]">25 mm</span>
                    </div>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Normalise measurements</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary">Calibrate once so every pellet entry is measured on the same scale before comparisons begin.</p>
                </SurfaceCard>

                <SurfaceCard className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">Step 03</span>
                    <Gauge size={16} className="text-[var(--brass)]" />
                  </div>
                  <div className="mt-4 flex h-32 flex-col items-center justify-center gap-2 rounded-[18px] border border-subtle bg-page">
                    <div className="rounded-full border border-[var(--brass)]/25 bg-surface px-4 py-1.5 font-mono text-sm font-semibold text-[var(--brass)]">45 m</div>
                    <div className="flex gap-2">
                      <span className="rounded-full border border-[var(--brass)]/25 bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brass)]">.177</span>
                      <span className="rounded-full border border-subtle bg-surface px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">.22</span>
                      <span className="rounded-full border border-subtle bg-surface px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">.25</span>
                    </div>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Measure each candidate consistently</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary">Apply range and caliber context so each measured group is directly comparable across sessions.</p>
                </SurfaceCard>

                <SurfaceCard className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">Step 04</span>
                    <ScanLine size={16} className="text-[var(--brass)]" />
                  </div>
                  <div className="mt-4 flex h-32 items-center justify-center rounded-[18px] border border-subtle bg-page">
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[var(--brass)]/20">
                      <div className="absolute h-16 w-16 rounded-full border border-subtle" />
                      {[
                        'left-[28px] top-[30px]',
                        'left-[40px] top-[34px]',
                        'left-[34px] top-[44px]',
                        'left-[46px] top-[48px]',
                        'left-[30px] top-[54px]',
                      ].map((position) => (
                        <span
                          key={position}
                          className={`absolute h-2 w-2 rounded-full bg-[var(--brass)] shadow-[0_0_0_3px_rgba(184,136,44,0.18)] ${position}`}
                        />
                      ))}
                      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--brass)]/25 bg-surface px-2 py-0.5 font-mono text-[10px] text-[var(--brass)]">Auto-detected · 5 shots</span>
                    </div>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Validate outliers before ranking</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary">Review auto-detected groups and fix edge cases so one bad read does not distort pellet comparisons.</p>
                </SurfaceCard>

                <SurfaceCard className="rounded-[24px] p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brass)]">Step 05</span>
                    <BarChart3 size={16} className="text-[var(--brass)]" />
                  </div>
                  <div className="mt-4 flex h-32 flex-col justify-center gap-2 rounded-[18px] border border-subtle bg-page p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Group</span>
                      <span className="font-mono text-lg font-semibold text-[var(--brass)]">8.31mm</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-muted">MOA</span>
                      <span className="font-mono text-sm font-semibold text-primary">0.63</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Mean R.</span>
                      <span className="font-mono text-sm font-semibold text-primary">3.12mm</span>
                    </div>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Rank setups with confidence</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary">Turn measured outcomes into evidence-backed ordering so pellet changes are justified, not guessed.</p>
                </SurfaceCard>
              </div>
            </div>

            <div className="mt-20">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--brass)]">What it produces</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-primary">The group, the context, and the ranked setup — in one record</h3>
              </div>

              <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
                <SurfaceCard className="rounded-[28px] p-0">
                  <div className="border-b border-subtle px-6 py-5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Group Analysis</p>
                    <h4 className="mt-2 text-xl font-semibold text-primary">See the group, the scale, and the spread</h4>
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="rounded-[24px] border border-subtle bg-page p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Measured Target</p>
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--brass)]/30 bg-[var(--brass)]/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--brass)]">
                          Analysed &middot; 92%
                        </span>
                      </div>
                      <div className="relative mt-4 aspect-square overflow-hidden rounded-[24px] border border-subtle" style={{ background: '#f5efe2' }}>
                        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(60,40,20,0.06) 1px, transparent 1px)', backgroundSize: '6px 6px' }} />
                        <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
                          <g fill="none" stroke="rgba(60,40,20,0.18)" strokeWidth="1.2">
                            <circle cx="200" cy="200" r="160" />
                            <circle cx="200" cy="200" r="120" />
                            <circle cx="200" cy="200" r="80" />
                            <circle cx="200" cy="200" r="44" />
                            <circle cx="200" cy="200" r="18" fill="rgba(60,40,20,0.30)" />
                          </g>
                          <line x1="64" y1="356" x2="172" y2="356" stroke="#eab308" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.85" />
                          <circle cx="64" cy="356" r="9" fill="rgba(234,179,8,0.35)" stroke="#eab308" strokeWidth="2" />
                          <text x="64" y="360" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="600" fill="#7a5b00">A</text>
                          <circle cx="172" cy="356" r="9" fill="rgba(234,179,8,0.35)" stroke="#eab308" strokeWidth="2" />
                          <text x="172" y="360" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="600" fill="#7a5b00">B</text>
                          <rect x="98" y="332" width="40" height="16" rx="4" fill="rgba(20,20,20,0.85)" />
                          <text x="118" y="343" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="10" fill="#eab308">25 mm</text>
                          <g stroke="#ef4444" strokeWidth="1.4" opacity="0.85">
                            <line x1="0" y1="195" x2="400" y2="195" />
                            <line x1="205" y1="0" x2="205" y2="400" />
                          </g>
                          <g stroke="#ef4444" strokeWidth="2" fill="rgba(239,68,68,0.18)">
                            <circle cx="194" cy="180" r="11" />
                            <circle cx="210" cy="186" r="11" />
                            <circle cx="201" cy="198" r="11" />
                            <circle cx="217" cy="202" r="11" />
                            <circle cx="196" cy="210" r="11" />
                          </g>
                          <rect x="178" y="164" width="58" height="62" rx="4" fill="none" stroke="rgba(184,136,44,0.85)" strokeWidth="1.3" strokeDasharray="4 3" />
                          <rect x="186" y="232" width="76" height="18" rx="4" fill="rgba(20,20,20,0.85)" stroke="rgba(184,136,44,0.5)" strokeWidth="1" />
                          <text x="224" y="244" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="11" fontWeight="500" fill="#d4a44a">Group: 8.31 mm</text>
                        </svg>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg border border-subtle bg-surface px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:tracking-[0.14em]">Group</p>
                          <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--brass)]">8.31 mm</p>
                        </div>
                        <div className="rounded-lg border border-subtle bg-surface px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:tracking-[0.14em]">MOA</p>
                          <p className="mt-0.5 font-mono text-xs font-semibold text-primary">0.63</p>
                        </div>
                        <div className="rounded-lg border border-subtle bg-surface px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:tracking-[0.14em]">Distance</p>
                          <p className="mt-0.5 font-mono text-xs font-semibold text-primary">45 m</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-subtle bg-page p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Session Summary</p>
                          <p className="mt-2 text-lg font-semibold text-primary">One image, three decisions</p>
                        </div>
                        <Crosshair size={18} className="text-[var(--brass)]" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Best</p>
                          <p className="mt-2 font-mono text-base font-semibold text-[var(--brass)] sm:text-lg">8.31<span className="text-xs">mm</span></p>
                        </div>
                        <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Average</p>
                          <p className="mt-2 font-mono text-base font-semibold text-primary sm:text-lg">10.02<span className="text-xs">mm</span></p>
                        </div>
                        <div className="rounded-2xl border border-subtle bg-surface px-2 py-3 sm:px-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-muted sm:text-[10px] sm:tracking-[0.18em]">Spread</p>
                          <p className="mt-2 font-mono text-base font-semibold text-primary sm:text-lg">1.71<span className="text-xs">mm</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SurfaceCard>

                <SurfaceCard className="rounded-[28px] p-0">
                  <div className="border-b border-subtle px-6 py-5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Pellet Test Detail</p>
                    <h4 className="mt-2 text-xl font-semibold text-primary">Know why a pellet wins, not just that it won</h4>
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="rounded-[22px] border border-subtle bg-page p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Setup</p>
                          <p className="mt-2 text-sm font-semibold text-primary">TX200 MkIII / JSB Exact 8.44 / Batch A21</p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--brass)]/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--brass)]">
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

              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {imageAnalysisPoints.map((item) => (
                  <div key={item.title} className="flex gap-4 rounded-2xl border border-subtle bg-surface-hover p-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brass)]/12 text-[var(--brass)]">
                      <Check size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">{item.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-secondary">{item.description}</p>
                    </div>
                  </div>
                ))}
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
              description="Create a club, run private or open leagues, and keep score submissions honest with peer confirmations and a full audit trail — all alongside your personal shooting record."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
              <SurfaceCard className="rounded-[28px] p-0">
                <div className="border-b border-subtle px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">League Workflow</p>
                  <h3 className="mt-2 text-2xl font-semibold text-primary">Less admin drag. Better visibility for everyone.</h3>
                </div>

                <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
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

        <section id="get-the-app" className="border-y border-subtle bg-surface px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="On The Range"
              title="Take it to the firing line"
              description="Score cards get logged where they're shot, not typed up later at a desk. SUB12 installs to the home screen on any phone today, and the native Android and iOS apps are coming soon."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <Smartphone size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">Android &amp; iOS apps</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  The native builds — camera capture, offline score entry, and push notifications for league results.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--brass)]/25 bg-[var(--brass)]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brass)]">
                  <Clock3 size={14} />
                  Coming soon
                </span>
                <p className="mt-3 text-[11px] leading-5 text-muted">
                  The store releases are being finished now. Until then, the home-screen install gives you the full experience on any phone.
                </p>
              </SurfaceCard>

              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <Share2 size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">iPhone &amp; iPad</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Open SUB12 in Safari, tap Share, then <span className="text-primary">Add to Home Screen</span>. It runs full-screen with its own icon, no App Store required.
                </p>
                <Link
                  to="/register"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]"
                >
                  Create an account
                  <ArrowRight size={16} />
                </Link>
              </SurfaceCard>

              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <WifiOff size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">Works without signal</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Ranges rarely have coverage. Capture targets and enter scores offline; everything syncs the moment you're back on a connection.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-secondary">
                  {['Quick capture from the camera', 'Draft score cards held on device', 'Automatic sync and conflict-free upload'].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check size={15} className="mt-0.5 shrink-0 text-[var(--brass)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </SurfaceCard>
            </div>
          </div>
        </section>

        <section id="open-source" className="px-4 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Open Source"
              title="Yours to read, run, and improve"
              description="SUB12 is open source under AGPL-3.0. The code that runs sub12.io is public on GitHub — audit how your data is handled, help build the platform, or run the whole thing yourself for your club."
              align="center"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <ScanLine size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">Every line public</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  No black box between your cards and the standings. The backend, the measurement pipeline, and the apps live in one public repository, auditable by anyone.
                </p>
                <a
                  href={sourceUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]"
                >
                  Read the source
                  <ArrowRight size={16} />
                </a>
              </SurfaceCard>

              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <Server size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">Self-host your own</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Run SUB12 on your own server with Docker Compose. One installer checks prerequisites, generates real secrets, and brings the stack up — then the first-run wizard makes it your club's own site.
                </p>
                <a
                  href={`${sourceUrl()}#installation`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]"
                >
                  Self-hosting guide
                  <ArrowRight size={16} />
                </a>
              </SurfaceCard>

              <SurfaceCard className="rounded-[24px] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brass)]/10 text-[var(--brass)]">
                  <GitPullRequest size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-primary">Built in the open</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Issues, ideas, and pull requests are welcome — and the AGPL-3.0 licence keeps every fork and every hosted copy open for the community that shoots with it.
                </p>
                <a
                  href={`${sourceUrl()}/blob/main/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]"
                >
                  Contribute
                  <ArrowRight size={16} />
                </a>
              </SurfaceCard>
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
                    Sign in
                  </Link>
                  <a
                    href={`${sourceUrl()}#installation`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl border border-subtle px-6 py-4 text-sm font-medium uppercase tracking-[0.16em] text-secondary transition-colors hover:border-[var(--brass)]/30 hover:text-[var(--brass)]"
                  >
                    Self-host it
                  </a>
                </div>

                <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted">
                  Start with pellet testing, build your score history, and grow into clubs and leagues when you need them — or host the whole platform yourself.
                </p>
              </div>
            </SurfaceCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-subtle py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
            SUB12 - Precision shooting platform - Developed by{' '}
            <a href="https://eyup.io" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--brass)] transition-colors">EyUp.io</a>
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
            &copy; 2025 SUB12 -{' '}
            {/* AGPL-3.0 section 13: a network service built from modified sources
                must offer those sources to its users. This is that offer. */}
            <a href={sourceUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--brass)] transition-colors">Open source</a>
            {' '}under AGPL-3.0
          </p>
        </div>
      </footer>
    </div>
  )
}
