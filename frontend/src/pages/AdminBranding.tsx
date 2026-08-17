import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImageOff, Loader2, Upload } from 'lucide-react'
import {
  adminSiteApi,
  type DeploymentMode,
  type SiteSettings,
  type SiteTheme,
  type UpdateSiteSettingsInput,
} from '../api/site'
import { clubsApi } from '../api/clubs'
import { BRANDING_QUERY_KEY } from '../store/branding'
import { PoweredBy } from '../components/PoweredBy'
import { SkeletonPage } from '../components/Skeleton'
import { toast } from '../store/toast'
import { ApiError } from '../api/client'
import { applyAccents, DEFAULT_ACCENT_DARK, DEFAULT_ACCENT_LIGHT } from '../utils/branding'

const inputCls =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-primary placeholder-muted focus:outline-none focus:border-[var(--brass)] focus:shadow-[0_0_0_3px_var(--ring)] transition-all text-sm'
const labelCls = 'block text-[11px] uppercase tracking-widest text-muted mb-1.5'

/**
 * Everything the setup wizard asked, editable afterwards.
 *
 * The wizard runs once; a deployment's identity changes for years. This page
 * is where it changes — and it is the only place a logo can be uploaded, since
 * that needs an authenticated account and setup runs before there is one.
 */
export default function AdminBranding() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-site-settings'],
    queryFn: () => adminSiteApi.get(),
  })

  // The club list only matters in single-club mode, where it is how the
  // deployment is pointed at a different club than the wizard created.
  const { data: clubs } = useQuery({
    queryKey: ['admin-site-settings', 'clubs'],
    queryFn: () => clubsApi.list(),
    enabled: form?.deployment_mode === 'single_club',
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  // Live preview, exactly as in the wizard: the page you are editing is the
  // page that changes. Reverted on unmount so a cancelled edit doesn't leave
  // the rest of the app wearing a colour nobody saved.
  useEffect(() => {
    if (form) applyAccents(form.accent_light, form.accent_dark)
  }, [form])
  useEffect(() => {
    return () => {
      if (data) applyAccents(data.accent_light, data.accent_dark)
    }
  }, [data])

  const save = useMutation({
    mutationFn: (payload: UpdateSiteSettingsInput) => adminSiteApi.update(payload),
    onSuccess: async (updated) => {
      setForm(updated)
      queryClient.setQueryData(['admin-site-settings'], updated)
      await queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY })
      toast('Branding saved', 'success')
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to save branding', 'error')
    },
  })

  async function uploadLogo(file: File) {
    setUploading(true)
    try {
      const updated = await adminSiteApi.uploadLogo(file)
      setForm(updated)
      queryClient.setQueryData(['admin-site-settings'], updated)
      await queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY })
      toast('Logo updated', 'success')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to upload logo', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeLogo() {
    try {
      const updated = await adminSiteApi.deleteLogo()
      setForm(updated)
      queryClient.setQueryData(['admin-site-settings'], updated)
      await queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY })
      toast('Logo removed', 'success')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove logo', 'error')
    }
  }

  if (isLoading || !form) return <SkeletonPage />

  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    save.mutate({
      site_name: form.site_name,
      tagline: form.tagline,
      deployment_mode: form.deployment_mode,
      primary_club_id: form.primary_club_id ?? '',
      accent_light: form.accent_light,
      accent_dark: form.accent_dark,
      default_theme: form.default_theme,
      allow_theme_toggle: form.allow_theme_toggle,
      welcome_heading: form.welcome_heading,
      welcome_message: form.welcome_message,
      support_email: form.support_email,
      public_registration: form.public_registration,
    })
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-primary" style={{ fontFamily: 'var(--serif)' }}>
          Branding
        </h1>
        <p className="mt-1 text-sm text-muted">
          What this installation calls itself and how it looks. Colours preview live as you edit
          and only stick once you save.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        <Card title="Identity">
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="site-name">Name</label>
              <input id="site-name" className={inputCls} maxLength={60}
                value={form.site_name} onChange={(e) => set('site_name', e.target.value)} placeholder="SUB12" />
            </div>
            <div>
              <label className={labelCls} htmlFor="tagline">Tagline</label>
              <input id="tagline" className={inputCls} maxLength={120}
                value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </div>
            <div>
              <p className={labelCls}>Logo</p>
              <div className="flex flex-wrap items-center gap-3">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Current logo" className="h-10 max-w-[180px] object-contain" />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <ImageOff size={14} /> No logo — the name is drawn instead
                  </span>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f) }}
                />
                <button type="button" className="btn btn-secondary btn-sm" disabled={uploading}
                  onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {form.logo_url ? 'Replace' : 'Upload'}
                </button>
                {form.logo_url && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeLogo()}>
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted">PNG, JPEG or WebP, up to 2MB. Drawn about 36px tall.</p>
            </div>
          </div>
        </Card>

        <Card title="Deployment">
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="mode">Shape</label>
              <select id="mode" className={inputCls} value={form.deployment_mode}
                onChange={(e) => set('deployment_mode', e.target.value as DeploymentMode)}>
                <option value="community">Community — a directory of clubs and leagues</option>
                <option value="single_club">One club — this installation is that club's site</option>
              </select>
            </div>
            {form.deployment_mode === 'single_club' && (
              <div>
                <label className={labelCls} htmlFor="primary-club">The club</label>
                <select id="primary-club" className={inputCls} value={form.primary_club_id ?? ''}
                  onChange={(e) => set('primary_club_id', e.target.value)}>
                  <option value="">Choose a club…</option>
                  {(clubs?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">
                  The club nav entry carries this club's name and the directory goes straight to it.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Colour and theme">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField id="accent-light" label="Accent — light mode"
                value={form.accent_light} placeholder={DEFAULT_ACCENT_LIGHT}
                onChange={(v) => set('accent_light', v)} />
              <ColorField id="accent-dark" label="Accent — dark mode"
                value={form.accent_dark} placeholder={DEFAULT_ACCENT_DARK}
                onChange={(v) => set('accent_dark', v)} />
            </div>
            <p className="text-xs text-muted">
              Leave either blank to keep sub12's own brass for that mode.
            </p>
            <div>
              <label className={labelCls} htmlFor="theme">Theme people start in</label>
              <select id="theme" className={inputCls} value={form.default_theme}
                onChange={(e) => set('default_theme', e.target.value as SiteTheme)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">Follow the device</option>
              </select>
            </div>
            <Toggle label="Let people switch theme" checked={form.allow_theme_toggle}
              hint="Off hides the toggle and fixes everyone on the theme above."
              onChange={(v) => set('allow_theme_toggle', v)} />
          </div>
        </Card>

        <Card title="Welcome and access">
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="welcome-heading">Welcome heading</label>
              <input id="welcome-heading" className={inputCls} maxLength={120}
                value={form.welcome_heading} onChange={(e) => set('welcome_heading', e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="welcome-message">Welcome message</label>
              <textarea id="welcome-message" className={`${inputCls} min-h-[90px]`} maxLength={600}
                value={form.welcome_message} onChange={(e) => set('welcome_message', e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="support-email">Support email</label>
              <input id="support-email" type="email" className={inputCls}
                value={form.support_email} onChange={(e) => set('support_email', e.target.value)} />
            </div>
            <Toggle label="Open registration" checked={form.public_registration}
              hint="Off means new accounts are created by an administrator."
              onChange={(v) => set('public_registration', v)} />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <PoweredBy className="text-[11px] text-muted" />
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save branding
          </button>
        </div>
      </form>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-card p-5 space-y-4">
      <h2 className="text-sm uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  )
}

function ColorField({
  id, label, value, placeholder, onChange,
}: { id: string; label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-subtle bg-surface p-1"
        />
        <input id={id} className={`${inputCls} u-tnum`} value={value} placeholder={placeholder}
          spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}

function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brass)]" />
      <span>
        <span className="block text-sm text-primary">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}
