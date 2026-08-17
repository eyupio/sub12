import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Globe2, Loader2, Lock, Moon, Palette, ShieldCheck, Sun, Users } from 'lucide-react'
import { WizardShell } from '../components/wizard/WizardShell'
import type { WizardStepDescriptor } from '../components/wizard/WizardStepper'
import { PoweredBy } from '../components/PoweredBy'
import { BRANDING_QUERY_KEY } from '../store/branding'
import { siteApi, type DeploymentMode, type SetupInput, type SiteTheme } from '../api/site'
import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'
import { applyAccents, DEFAULT_ACCENT_DARK, DEFAULT_ACCENT_LIGHT } from '../utils/branding'
import { Spinner } from '../components/Skeleton'

// Accent presets. A self-hoster who has no colour in mind should not have to
// invent one, and each pair is chosen so the light and dark schemes read as
// the same identity rather than two unrelated colours.
const ACCENT_PRESETS: { name: string; light: string; dark: string }[] = [
  { name: 'Brass', light: DEFAULT_ACCENT_LIGHT, dark: DEFAULT_ACCENT_DARK },
  { name: 'Range green', light: '#4f7a3f', dark: '#87b06d' },
  { name: 'Slate blue', light: '#3f5f8a', dark: '#7fa5d6' },
  { name: 'Claret', light: '#8c3b45', dark: '#cf7c86' },
  { name: 'Copper', light: '#a75c2b', dark: '#e0925c' },
  { name: 'Graphite', light: '#4a4a52', dark: '#a5a5b0' },
]

type StepKey = 'welcome' | 'shape' | 'identity' | 'look' | 'admin' | 'review'

const STEP_LABELS: Record<StepKey, string> = {
  welcome: 'Welcome',
  shape: 'Deployment',
  identity: 'Identity',
  look: 'Look',
  admin: 'Administrator',
  review: 'Finish',
}

const STEP_ORDER: StepKey[] = ['welcome', 'shape', 'identity', 'look', 'admin', 'review']

interface Draft {
  mode: DeploymentMode
  siteName: string
  tagline: string
  clubName: string
  clubDescription: string
  clubType: 'public' | 'private'
  clubJoinPolicy: 'open' | 'invite_code' | 'approval'
  accentLight: string
  accentDark: string
  theme: SiteTheme
  allowThemeToggle: boolean
  welcomeHeading: string
  welcomeMessage: string
  supportEmail: string
  publicRegistration: boolean
  adminName: string
  adminEmail: string
  adminPassword: string
  adminPasswordConfirm: string
}

const EMPTY_DRAFT: Draft = {
  mode: 'community',
  siteName: '',
  tagline: '',
  clubName: '',
  clubDescription: '',
  clubType: 'public',
  clubJoinPolicy: 'open',
  accentLight: DEFAULT_ACCENT_LIGHT,
  accentDark: DEFAULT_ACCENT_DARK,
  theme: 'dark',
  allowThemeToggle: true,
  welcomeHeading: '',
  welcomeMessage: '',
  supportEmail: '',
  publicRegistration: true,
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
}

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:shadow-[0_0_0_3px_var(--ring)] transition-all text-sm'
const labelCls = 'block text-[11px] uppercase tracking-widest text-muted mb-1.5'

/**
 * First-run setup for a self-hosted deployment.
 *
 * The wizard exists because `docker compose up` leaves an operator staring at
 * a login form for an account that does not exist yet, with nothing on screen
 * to say what this installation is or who it is for. It answers those in one
 * pass: what shape the deployment is (a community, or one club's own site),
 * what it is called and coloured, and who administers it.
 *
 * It is served at /setup and closes permanently the moment it succeeds — the
 * backend's `POST /setup` is the authority on that, not this page. What is
 * rendered here is only ever the *offer*; the guard that matters is server
 * side, because an unauthenticated endpoint that mints an administrator has to
 * be safe against somebody who never loads this page at all.
 */
export default function SetupWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: status, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => siteApi.setupStatus(),
    staleTime: 0,
    retry: false,
  })

  // Anyone who reaches /setup on a deployment that is already running is sent
  // to the login form rather than shown a wizard that would only 409.
  useEffect(() => {
    if (status && !status.needs_setup) navigate({ to: '/login', replace: true })
  }, [status, navigate])

  // The colours are previewed live on the wizard itself — choosing an accent
  // from a swatch grid tells you far less than watching the page take it.
  useEffect(() => {
    applyAccents(draft.accentLight, draft.accentDark)
  }, [draft.accentLight, draft.accentDark])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // In single-club mode the club's name is the deployment's name unless the
  // operator has deliberately typed a different one.
  const effectiveSiteName =
    draft.mode === 'single_club' && !draft.siteName.trim() ? draft.clubName.trim() : draft.siteName.trim()

  const stepValid = useMemo<Record<StepKey, boolean>>(() => {
    const passwordOk = draft.adminPassword.length >= 8 && draft.adminPassword === draft.adminPasswordConfirm
    return {
      welcome: true,
      shape: draft.mode === 'community' || draft.clubName.trim().length > 0,
      identity: effectiveSiteName.length > 0,
      look: true,
      admin: draft.adminName.trim().length > 0 && /.+@.+\..+/.test(draft.adminEmail.trim()) && passwordOk,
      review: true,
    }
  }, [draft, effectiveSiteName])

  const stepKey = STEP_ORDER[index]
  // A step is reachable once every step before it is satisfied, so the stepper
  // can be used to go back and correct something without letting anyone skip
  // the administrator step by clicking "Finish".
  const firstIncomplete = STEP_ORDER.findIndex((k) => !stepValid[k])
  const furthestReachable = firstIncomplete === -1 ? STEP_ORDER.length - 1 : firstIncomplete

  const steps: WizardStepDescriptor[] = STEP_ORDER.map((key, i) => ({
    key,
    label: STEP_LABELS[key],
    status: i === index ? 'current' : stepValid[key] && i < index ? 'complete' : 'pending',
    reachable: i <= Math.max(index, furthestReachable),
  }))

  async function submit() {
    setSubmitting(true)
    setError(null)
    const payload: SetupInput = {
      site_name: effectiveSiteName,
      tagline: draft.tagline.trim(),
      deployment_mode: draft.mode,
      accent_light: draft.accentLight,
      accent_dark: draft.accentDark,
      default_theme: draft.theme,
      allow_theme_toggle: draft.allowThemeToggle,
      welcome_heading: draft.welcomeHeading.trim(),
      welcome_message: draft.welcomeMessage.trim(),
      support_email: draft.supportEmail.trim(),
      public_registration: draft.publicRegistration,
      admin: {
        email: draft.adminEmail.trim(),
        display_name: draft.adminName.trim(),
        password: draft.adminPassword,
      },
      club:
        draft.mode === 'single_club'
          ? {
              name: draft.clubName.trim(),
              description: draft.clubDescription.trim(),
              type: draft.clubType,
              join_policy: draft.clubJoinPolicy,
            }
          : undefined,
    }

    try {
      await siteApi.completeSetup(payload)
    } catch (err) {
      setSubmitting(false)
      if (err instanceof ApiError && err.status === 409) {
        setError('This deployment has already been set up. Sign in with the administrator account instead.')
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Couldn't reach the server. Check the backend is running and try again.")
      }
      return
    }

    // Setup deliberately returns no tokens: signing in goes through the
    // ordinary login endpoint, so the refresh cookie, the rate limiter and
    // every other part of the session path are the same ones used forever
    // after. A login that fails here is not a failed setup — the deployment
    // is up, and the operator just signs in by hand.
    let signedIn = false
    try {
      const result = await authApi.login(payload.admin.email, payload.admin.password)
      if (result.kind === 'complete') {
        setAuth(result.user, result.tokens.access_token, result.tokens.refresh_token)
        signedIn = true
      }
    } catch { /* fall through to the login page */ }

    await queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: ['setup-status'] })
    navigate({ to: signedIn ? '/' : '/login', replace: true })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <WizardShell
      steps={steps}
      currentIndex={index}
      onJump={(i) => setIndex(i)}
      onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
      onNext={
        stepKey === 'review'
          ? () => { void submit() }
          : () => setIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1))
      }
      nextLabel={stepKey === 'review' ? (submitting ? 'Setting up…' : 'Finish setup') : 'Continue'}
      nextDisabled={!stepValid[stepKey] || submitting}
      isLast={stepKey === 'review'}
      saveError={error}
      topBar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-primary" style={{ fontFamily: 'var(--serif)' }}>
              Set up your installation
            </h1>
            <p className="text-sm text-muted mt-1">
              Six short steps. Everything here can be changed later from Admin → Branding.
            </p>
          </div>
          <PoweredBy className="text-[11px] text-muted" />
        </div>
      }
    >
      {stepKey === 'welcome' && <WelcomeStep />}

      {stepKey === 'shape' && (
        <Section title="What is this installation for?" hint="This decides how the app presents itself. You can switch later.">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              selected={draft.mode === 'community'}
              onSelect={() => set('mode', 'community')}
              icon={<Globe2 size={18} />}
              title="A community"
              body="Anyone can sign up, discover clubs, join leagues and shoot events. This is how sub12.io itself runs."
            />
            <ModeCard
              selected={draft.mode === 'single_club'}
              onSelect={() => set('mode', 'single_club')}
              icon={<Building2 size={18} />}
              title="One club"
              body="The whole installation is your club's own site. Your club is the front door rather than one entry in a directory."
            />
          </div>

          {draft.mode === 'single_club' && (
            <div className="mt-5 space-y-4 border-t border-subtle pt-5">
              <div>
                <label className={labelCls} htmlFor="club-name">Club name</label>
                <input
                  id="club-name"
                  className={inputCls}
                  value={draft.clubName}
                  onChange={(e) => set('clubName', e.target.value)}
                  placeholder="Dale Head Rifle Club"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="club-description">About the club</label>
                <textarea
                  id="club-description"
                  className={`${inputCls} min-h-[80px]`}
                  value={draft.clubDescription}
                  onChange={(e) => set('clubDescription', e.target.value)}
                  placeholder="Where you shoot, what disciplines, who's welcome."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="club-type">Visibility</label>
                  <select
                    id="club-type"
                    className={inputCls}
                    value={draft.clubType}
                    onChange={(e) => set('clubType', e.target.value as Draft['clubType'])}
                  >
                    <option value="public">Public — anyone can find it</option>
                    <option value="private">Private — members only</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="club-join">Joining</label>
                  <select
                    id="club-join"
                    className={inputCls}
                    value={draft.clubJoinPolicy}
                    onChange={(e) => set('clubJoinPolicy', e.target.value as Draft['clubJoinPolicy'])}
                  >
                    <option value="open">Open — anyone can join</option>
                    <option value="approval">Approval — you decide</option>
                    <option value="invite_code">Invite code only</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted">
                The club is created as an ordinary club owned by the administrator you set up next, so
                everything else in the app — leagues, standings, moderators — works on it as normal.
              </p>
            </div>
          )}
        </Section>
      )}

      {stepKey === 'identity' && (
        <Section title="What is it called?" hint="This is the name in the corner of every page and in the browser tab.">
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="site-name">Name</label>
              <input
                id="site-name"
                className={inputCls}
                value={draft.siteName}
                onChange={(e) => set('siteName', e.target.value)}
                placeholder={draft.mode === 'single_club' ? draft.clubName || 'Dale Head Rifle Club' : 'SUB12'}
                maxLength={60}
              />
              {draft.mode === 'single_club' && !draft.siteName.trim() && draft.clubName.trim() && (
                <p className="text-xs text-muted mt-1.5">Using your club's name: {draft.clubName.trim()}</p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="tagline">Tagline</label>
              <input
                id="tagline"
                className={inputCls}
                value={draft.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                placeholder="Precision shooting, properly tracked."
                maxLength={120}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="welcome-heading">Welcome heading</label>
              <input
                id="welcome-heading"
                className={inputCls}
                value={draft.welcomeHeading}
                onChange={(e) => set('welcomeHeading', e.target.value)}
                placeholder="Welcome to the club"
                maxLength={120}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="welcome-message">Welcome message</label>
              <textarea
                id="welcome-message"
                className={`${inputCls} min-h-[90px]`}
                value={draft.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                placeholder="Shown to people arriving at the sign-in page."
                maxLength={600}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="support-email">Support email</label>
                <input
                  id="support-email"
                  type="email"
                  className={inputCls}
                  value={draft.supportEmail}
                  onChange={(e) => set('supportEmail', e.target.value)}
                  placeholder="secretary@example.org"
                />
              </div>
              <Toggle
                label="Open registration"
                hint="Off means new accounts are created by an administrator."
                checked={draft.publicRegistration}
                onChange={(v) => set('publicRegistration', v)}
              />
            </div>
          </div>
        </Section>
      )}

      {stepKey === 'look' && (
        <Section title="How should it look?" hint="The page around you updates as you choose — this is the real thing, not a mock-up.">
          <div className="space-y-6">
            <div>
              <p className={labelCls}>Accent colour</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ACCENT_PRESETS.map((preset) => {
                  const selected = draft.accentLight === preset.light && draft.accentDark === preset.dark
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, accentLight: preset.light, accentDark: preset.dark }))}
                      aria-pressed={selected}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        selected ? 'border-[var(--brass)] bg-[var(--brass-dim)]' : 'border-subtle hover:border-[var(--brass)]/40'
                      }`}
                    >
                      <span className="flex shrink-0">
                        <span className="h-5 w-5 rounded-full border border-subtle" style={{ background: preset.light }} />
                        <span className="-ml-2 h-5 w-5 rounded-full border border-subtle" style={{ background: preset.dark }} />
                      </span>
                      <span className="flex-1 truncate text-primary">{preset.name}</span>
                      {selected && <Check size={14} className="text-[var(--brass)]" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                id="accent-light"
                label="Custom — light mode"
                value={draft.accentLight}
                onChange={(v) => set('accentLight', v)}
              />
              <ColorField
                id="accent-dark"
                label="Custom — dark mode"
                value={draft.accentDark}
                onChange={(v) => set('accentDark', v)}
              />
            </div>

            <div>
              <p className={labelCls}>Theme people start in</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} /> },
                  { value: 'light' as const, label: 'Light', icon: <Sun size={14} /> },
                  { value: 'system' as const, label: 'Follow device', icon: <Palette size={14} /> },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('theme', opt.value)}
                    aria-pressed={draft.theme === opt.value}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs uppercase tracking-widest transition-colors ${
                      draft.theme === opt.value
                        ? 'border-[var(--brass)] text-[var(--brass)] bg-[var(--brass-dim)]'
                        : 'border-subtle text-muted hover:border-[var(--brass)]/40'
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Toggle
              label="Let people switch theme"
              hint="Off fixes everyone on the theme above."
              checked={draft.allowThemeToggle}
              onChange={(v) => set('allowThemeToggle', v)}
            />

            <p className="text-xs text-muted">
              A logo goes in after setup, from Admin → Branding — uploading one needs the administrator
              account you are about to create.
            </p>
          </div>
        </Section>
      )}

      {stepKey === 'admin' && (
        <Section
          title="Who runs it?"
          hint="The first administrator. This is the only time an account can be created without signing in, so it happens once and the wizard closes behind it."
        >
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="admin-name">Name</label>
              <input
                id="admin-name"
                className={inputCls}
                value={draft.adminName}
                onChange={(e) => set('adminName', e.target.value)}
                autoComplete="name"
                maxLength={64}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                className={inputCls}
                value={draft.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="admin-password">Password</label>
                <input
                  id="admin-password"
                  type="password"
                  className={inputCls}
                  value={draft.adminPassword}
                  onChange={(e) => set('adminPassword', e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted mt-1.5">At least 8 characters.</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="admin-password-confirm">Confirm password</label>
                <input
                  id="admin-password-confirm"
                  type="password"
                  className={inputCls}
                  value={draft.adminPasswordConfirm}
                  onChange={(e) => set('adminPasswordConfirm', e.target.value)}
                  autoComplete="new-password"
                />
                {draft.adminPasswordConfirm.length > 0 && draft.adminPassword !== draft.adminPasswordConfirm && (
                  <p className="text-xs text-[var(--error-text)] mt-1.5">Passwords don't match.</p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted inline-flex items-start gap-1.5">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" />
              Turn on two-factor authentication from Profile → Security once you're in.
            </p>
          </div>
        </Section>
      )}

      {stepKey === 'review' && (
        <Section title="Ready" hint="Check it over, then finish. You'll be signed in as the administrator.">
          <dl className="divide-y divide-[var(--line)] text-sm">
            <Row label="Deployment">{draft.mode === 'single_club' ? `One club — ${draft.clubName}` : 'Community'}</Row>
            <Row label="Name">{effectiveSiteName}</Row>
            {draft.tagline && <Row label="Tagline">{draft.tagline}</Row>}
            <Row label="Accent">
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border border-subtle" style={{ background: draft.accentLight }} />
                <span className="h-4 w-4 rounded-full border border-subtle" style={{ background: draft.accentDark }} />
                <span className="u-tnum text-muted">{draft.accentLight} / {draft.accentDark}</span>
              </span>
            </Row>
            <Row label="Theme">
              {draft.theme === 'system' ? 'Follows the device' : draft.theme}
              {!draft.allowThemeToggle && ' · fixed'}
            </Row>
            <Row label="Registration">{draft.publicRegistration ? 'Open to anyone' : 'Administrator only'}</Row>
            <Row label="Administrator">{draft.adminName} · {draft.adminEmail}</Row>
          </dl>

          {submitting && (
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Creating the administrator and applying your settings…
            </p>
          )}
        </Section>
      )}
    </WizardShell>
  )
}

function WelcomeStep() {
  return (
    <Section title="This installation is yours to name" hint="It takes about a minute.">
      <ul className="space-y-3 text-sm text-secondary">
        <li className="flex gap-3">
          <Users size={16} className="mt-0.5 shrink-0 text-[var(--brass)]" />
          <span>Decide whether this is a <strong className="text-primary">community</strong> anyone can join, or <strong className="text-primary">one club's own site</strong>.</span>
        </li>
        <li className="flex gap-3">
          <Palette size={16} className="mt-0.5 shrink-0 text-[var(--brass)]" />
          <span>Give it your name, tagline and colours — a logo can follow from the admin pages.</span>
        </li>
        <li className="flex gap-3">
          <Lock size={16} className="mt-0.5 shrink-0 text-[var(--brass)]" />
          <span>Create the first administrator. After that the wizard closes for good and new accounts come through the normal sign-up.</span>
        </li>
      </ul>
      <p className="mt-6 text-xs text-muted">
        Nothing here is permanent except the administrator account: every other answer is editable
        afterwards from Admin → Branding.
      </p>
    </Section>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card animate-fade-in-up">
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      {hint && <p className="mt-1 mb-5 text-sm text-muted">{hint}</p>}
      {!hint && <div className="mb-5" />}
      {children}
    </div>
  )
}

function ModeCard({
  selected, onSelect, icon, title, body,
}: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`u-lift text-left rounded-lg border p-4 transition-colors ${
        selected ? 'border-[var(--brass)] bg-[var(--brass-dim)]' : 'border-subtle hover:border-[var(--brass)]/40'
      }`}
    >
      <span className="inline-flex items-center gap-2 text-primary font-medium">
        <span className="text-[var(--brass)]">{icon}</span>
        {title}
        {selected && <Check size={14} className="text-[var(--brass)]" />}
      </span>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </button>
  )
}

function ColorField({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-picker`}
          type="color"
          aria-label={`${label} colour picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-subtle bg-surface p-1"
        />
        <input
          id={id}
          className={`${inputCls} u-tnum`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#a07b2c"
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brass)]"
      />
      <span>
        <span className="block text-sm text-primary">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
      <dt className="text-[11px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-primary text-right">{children}</dd>
    </div>
  )
}
