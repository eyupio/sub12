import { useEffect, type PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import { siteApi } from '../api/site'
import { applyAccents, documentTitleFor } from '../utils/branding'
import { adoptDeploymentTheme } from '../store/theme'
import { BrandingContext, BRANDING_QUERY_KEY, DEFAULT_BRANDING } from '../store/branding'

// Fetches the deployment's identity once and applies the parts that live
// outside React: the accent stylesheet, the document title and the theme the
// app boots into. Branding is public and changes rarely, so it is cached hard
// — the branding admin page invalidates the key itself after a save.
export function BrandingProvider({ children }: PropsWithChildren) {
  const { data } = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => siteApi.branding(),
    staleTime: 5 * 60 * 1000,
    // A deployment whose branding endpoint is unreachable still has to boot;
    // the context falls back to DEFAULT_BRANDING and the app runs unbranded.
    retry: 1,
  })

  const branding = data ?? DEFAULT_BRANDING

  useEffect(() => {
    applyAccents(branding.accent_light, branding.accent_dark)
  }, [branding.accent_light, branding.accent_dark])

  useEffect(() => {
    const title = documentTitleFor(branding.site_name, branding.tagline)
    // An unbranded deployment keeps the shell's own <title>, which carries the
    // description search engines index.
    if (title && title !== 'SUB12') document.title = title
  }, [branding.site_name, branding.tagline])

  useEffect(() => {
    adoptDeploymentTheme(branding.default_theme, !branding.allow_theme_toggle)
  }, [branding.default_theme, branding.allow_theme_toggle])

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}
