import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { BrandingProvider } from './components/BrandingProvider'
import { useBranding } from './store/branding'

// A deployment nobody has set up yet has no account to sign in with, so the
// login form is a dead end. Anyone arriving anywhere on it is taken to the
// wizard instead — once. The offer is only cosmetic: POST /setup is what
// actually decides whether the wizard is open, and it closes itself for good
// the first time it succeeds.
function SetupRedirect() {
  const { needs_setup } = useBranding()
  useEffect(() => {
    if (!needs_setup) return
    if (window.location.pathname === '/setup') return
    void router.navigate({ to: '/setup', replace: true })
  }, [needs_setup])
  return null
}

export default function App() {
  return (
    <BrandingProvider>
      <SetupRedirect />
      <RouterProvider router={router} />
    </BrandingProvider>
  )
}
