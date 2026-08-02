import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '../store/auth'
import Layout from '../components/Layout'
import Dashboard from './Dashboard'
import LandingPage from './LandingPage'
import NativeLanding from './NativeLanding'

export default function IndexPage() {
  // The persisted `user` is the returning-user signal: tokens are no longer
  // in localStorage (access stays in memory, refresh lives in an httpOnly
  // cookie). If the user record is present we render the app; the API client
  // will swap a fresh access token via the cookie on the first 401, or punt
  // to /login if the cookie is gone.
  const hasSession = useAuthStore((s) => !!(s.accessToken || s.user))

  if (hasSession) {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    )
  }

  // Inside the Capacitor shell the marketing site is the wrong first screen —
  // the app gets its own welcome instead of the web landing page.
  if (Capacitor.isNativePlatform()) {
    return <NativeLanding />
  }

  return <LandingPage />
}
