import { useAuthStore } from '../store/auth'
import Layout from '../components/Layout'
import Dashboard from './Dashboard'
import LandingPage from './LandingPage'

export default function IndexPage() {
  // A returning user has a persisted refresh token but no in-memory access
  // token yet (access tokens are not persisted to localStorage). Treat either
  // as "logged in" so the Dashboard renders and the API client transparently
  // refreshes on the first 401.
  const hasSession = useAuthStore((s) => !!(s.accessToken || s.refreshToken))

  if (hasSession) {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    )
  }

  return <LandingPage />
}
