import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Check, ChevronRight, X, Package, Target, Users, Crosshair, UserCircle, HelpCircle, Compass,
} from 'lucide-react'

const DISMISS_KEY = 'sub12-getting-started-dismissed'

// A user with this many cards has clearly found their way around, so the
// checklist retires itself even if they never joined a club or ran a test.
const EXPERIENCED_CARD_COUNT = 10

export interface GettingStartedProgress {
  /** Display name is set at registration, so "complete" means they added something of their own. */
  profileComplete: boolean
  hasRifle: boolean
  hasScoreCard: boolean
  /** Member of at least one club, league, or event. */
  hasCommunity: boolean
  hasPelletTest: boolean
}

interface Step {
  id: keyof GettingStartedProgress
  title: string
  body: string
  cta: string
  to: string
  icon: typeof Package
}

// Ordered as a genuine first session: kit in, card logged, then the social and
// analysis features that only make sense once there's data behind them.
const steps: Step[] = [
  {
    id: 'hasRifle',
    title: 'Add your first rifle',
    body: 'Search the built-in catalog to pre-fill the specs, or enter your own.',
    cta: 'Add rifle',
    to: '/gear',
    icon: Package,
  },
  {
    id: 'hasScoreCard',
    title: 'Log a score card',
    body: 'Enter 25 shots, pick the rifle and pellet you used, and your stats start building.',
    cta: 'Log a card',
    to: '/scores/new',
    icon: Target,
  },
  {
    id: 'profileComplete',
    title: 'Finish your profile',
    body: 'An avatar and location help club mates recognise you in feeds and standings.',
    cta: 'Edit profile',
    to: '/profile',
    icon: UserCircle,
  },
  {
    id: 'hasCommunity',
    title: 'Join a club or league',
    body: 'Clubs are your local community; leagues rank your cards against other shooters.',
    cta: 'Browse clubs',
    to: '/clubs',
    icon: Users,
  },
  {
    id: 'hasPelletTest',
    title: 'Run a pellet test',
    body: 'Photograph a group and sub12 measures it for you, so you can find the tin your rifle likes.',
    cta: 'Start a test',
    to: '/pellet-testing/new',
    icon: Crosshair,
  },
]

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * First-run checklist shown above the Dashboard. Every step is derived from
 * data the Dashboard already loads, so it costs no extra requests. It hides
 * itself once every step is done, once the user dismisses it, or once they
 * have enough cards logged to have obviously found their footing.
 */
export function GettingStarted({
  progress,
  cardsLogged,
}: {
  progress: GettingStartedProgress
  cardsLogged: number
}) {
  const [dismissed, setDismissed] = useState(readDismissed)

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode — dismissing for this session only is fine */
    }
  }, [])

  const doneCount = steps.filter(s => progress[s.id]).length
  const complete = doneCount === steps.length

  if (dismissed || complete || cardsLogged >= EXPERIENCED_CARD_COUNT) return null

  const pct = Math.round((doneCount / steps.length) * 100)
  const nextStep = steps.find(s => !progress[s.id])

  return (
    <section
      aria-labelledby="getting-started-title"
      className="bg-surface border border-line-2 rounded-[10px] shadow-card overflow-hidden animate-fade-in-up"
    >
      <header className="flex items-start justify-between gap-3 px-[18px] py-[14px] border-b border-line bg-gold-tint">
        <div className="min-w-0">
          <h2 id="getting-started-title" className="flex items-center gap-1.5 t-section-title">
            <Compass size={11} className="text-gold" />
            Getting started
          </h2>
          <p className="text-[11px] text-muted-2 mt-1 leading-relaxed">
            {doneCount === 0
              ? 'Five short steps to get sub12 working for you.'
              : nextStep
                ? `Nice one — ${doneCount} of ${steps.length} done. Next up: ${nextStep.title.toLowerCase()}.`
                : `${doneCount} of ${steps.length} done.`}
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Hide the getting started checklist"
          className="text-muted hover:text-ink u-press transition-colors shrink-0 no-min-target"
        >
          <X size={16} />
        </button>
      </header>

      <div className="px-[18px] pt-3">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-label={`${doneCount} of ${steps.length} setup steps complete`}
            className="h-1.5 flex-1 rounded-full bg-line overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] tracking-[0.18em] uppercase text-muted u-tnum shrink-0">
            {doneCount}/{steps.length}
          </span>
        </div>
      </div>

      <ol className="p-4 space-y-2 u-stagger">
        {steps.map(({ id, title, body, cta, to, icon: Icon }) => {
          const done = progress[id]
          return (
            <li key={id}>
              <Link
                to={to}
                aria-label={done ? `${title} — done` : title}
                className={`flex items-start gap-3 p-3 rounded-[10px] border transition-colors u-nudge ${
                  done
                    ? 'border-line bg-transparent'
                    : 'border-line-2 bg-gold-tint hover:border-gold'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 border ${
                    done
                      ? 'border-gold bg-gold text-white'
                      : 'border-line bg-surface text-gold'
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-medium leading-snug ${
                      done ? 'text-muted line-through' : 'text-ink'
                    }`}
                  >
                    {title}
                  </span>
                  {!done && (
                    <span className="block text-[11px] text-muted-2 mt-1 leading-relaxed">{body}</span>
                  )}
                </span>
                {!done && (
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] tracking-[0.18em] uppercase text-gold font-medium shrink-0 pt-0.5">
                    {cta}
                    <ChevronRight size={12} />
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>

      <div className="px-4 pb-4 -mt-1">
        <Link
          to="/help"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-gold transition-colors"
        >
          <HelpCircle size={13} />
          New to all this? Read the getting started guide
        </Link>
      </div>
    </section>
  )
}

export default GettingStarted
