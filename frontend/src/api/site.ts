import { api } from './client'

export type DeploymentMode = 'community' | 'single_club'
export type SiteTheme = 'light' | 'dark' | 'system'

// Fixed attribution the backend stamps onto every branding payload. A
// deployment can rename and recolour itself; it cannot detach itself from the
// project it runs, so these are read-only and always present.
export interface UpstreamAttribution {
  project_name: string
  project_url: string
  vendor_name: string
  vendor_url: string
}

export interface PrimaryClubSummary {
  id: string
  name: string
  slug?: string
  image_url?: string
}

export interface SiteBranding {
  site_name: string
  tagline: string
  deployment_mode: DeploymentMode
  logo_url: string
  accent_light: string
  accent_dark: string
  default_theme: SiteTheme
  allow_theme_toggle: boolean
  welcome_heading: string
  welcome_message: string
  support_email: string
  public_registration: boolean
  primary_club?: PrimaryClubSummary
  needs_setup: boolean
  upstream: UpstreamAttribution
}

// The admin view adds the operator-only fields the shell has no use for.
export interface SiteSettings extends Omit<SiteBranding, 'primary_club' | 'needs_setup' | 'upstream'> {
  id: number
  primary_club_id?: string
  setup_completed_at?: string
  updated_by?: string
  updated_at: string
}

// Omit to keep, empty string to clear — the same convention as league and club
// patches. `deployment_mode` and `default_theme` have no empty meaning and are
// refused if sent blank.
export interface UpdateSiteSettingsInput {
  site_name?: string
  tagline?: string
  deployment_mode?: DeploymentMode
  primary_club_id?: string
  accent_light?: string
  accent_dark?: string
  default_theme?: SiteTheme
  allow_theme_toggle?: boolean
  welcome_heading?: string
  welcome_message?: string
  support_email?: string
  public_registration?: boolean
}

export interface SetupInput {
  site_name: string
  tagline: string
  deployment_mode: DeploymentMode
  accent_light: string
  accent_dark: string
  default_theme: SiteTheme
  allow_theme_toggle: boolean
  welcome_heading: string
  welcome_message: string
  support_email: string
  public_registration: boolean
  admin: { email: string; display_name: string; password: string }
  club?: { name: string; description: string; type: string; join_policy: string }
}

export interface SetupResult {
  settings: SiteSettings
  admin_id: string
  club_id?: string
}

export const siteApi = {
  branding: () => api.get<SiteBranding>('/site/settings'),
  setupStatus: () => api.get<{ needs_setup: boolean }>('/setup/status'),
  completeSetup: (payload: SetupInput) => api.post<SetupResult>('/setup', payload),
}

export const adminSiteApi = {
  get: () => api.get<SiteSettings>('/admin/site-settings'),
  update: (payload: UpdateSiteSettingsInput) => api.patch<SiteSettings>('/admin/site-settings', payload),
  uploadLogo: (file: File) => {
    const fd = new FormData()
    fd.append('image', file)
    return api.upload<SiteSettings>('/admin/site-settings/logo', fd)
  },
  deleteLogo: () => api.del<SiteSettings>('/admin/site-settings/logo'),
}
