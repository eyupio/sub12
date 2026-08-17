import { createContext, useContext } from 'react'
import type { SiteBranding } from '../api/site'

// The branding a deployment that has never been through the setup wizard
// serves. It is also what every consumer sees while the request is in flight,
// so the shell paints as sub12 rather than as an empty frame that then jumps.
export const DEFAULT_BRANDING: SiteBranding = {
  site_name: 'SUB12',
  tagline: '',
  deployment_mode: 'community',
  logo_url: '',
  accent_light: '',
  accent_dark: '',
  default_theme: 'dark',
  allow_theme_toggle: true,
  welcome_heading: '',
  welcome_message: '',
  support_email: '',
  public_registration: true,
  needs_setup: false,
  upstream: {
    project_name: 'SUB12',
    project_url: 'https://sub12.io',
    vendor_name: 'EyUp.io',
    vendor_url: 'https://eyup.io',
  },
}

export const BRANDING_QUERY_KEY = ['site-branding'] as const

export const BrandingContext = createContext<SiteBranding>(DEFAULT_BRANDING)

// useBranding is the one way to read this deployment's identity. It never
// returns undefined, so a caller can render its branded and unbranded states
// from the same expression instead of guarding on load.
export function useBranding(): SiteBranding {
  return useContext(BrandingContext)
}
