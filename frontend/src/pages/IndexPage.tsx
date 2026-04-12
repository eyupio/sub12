import { useAuthStore } from '../store/auth'
import Layout from '../components/Layout'
import Dashboard from './Dashboard'
import LandingPage from './LandingPage'

export default function IndexPage() {
  const token = useAuthStore((s) => s.accessToken)

  if (token) {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    )
  }

  return <LandingPage />
}
