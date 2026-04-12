import { createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import AuthLayout from './components/AuthLayout'
import IndexPage from './pages/IndexPage'
import ScoreEntry from './pages/ScoreEntry'
import ScoreHistory from './pages/ScoreHistory'
import ScoreCardDetail from './pages/ScoreCardDetail'
import Gear from './pages/Gear'
import Leagues from './pages/Leagues'
import LeagueDetail from './pages/LeagueDetail'
import LeagueSettings from './pages/LeagueSettings'
import PelletTesting from './pages/PelletTesting'
import NewPelletTest from './pages/NewPelletTest'
import PelletTestDetail from './pages/PelletTestDetail'
import PelletTestLeaderboard from './pages/PelletTestLeaderboard'
import PelletComparison from './pages/PelletComparison'
import BatchReport from './pages/BatchReport'
import PublicPelletLeaderboard from './pages/PublicPelletLeaderboard'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminEmailSettings from './pages/AdminEmailSettings'
import AdminEmailTemplates from './pages/AdminEmailTemplates'

// Guard: redirect to /login if not authenticated
function requireAuth() {
  const token = useAuthStore.getState().accessToken
  if (!token) throw redirect({ to: '/login' })
}

// Guard: redirect to / if already authenticated
function requireGuest() {
  const token = useAuthStore.getState().accessToken
  if (token) throw redirect({ to: '/' })
}

const rootRoute = createRootRoute()

// Authenticated shell (with bottom nav)
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: Layout,
  beforeLoad: requireAuth,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

const scoreHistoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores',
  component: ScoreHistory,
})

const scoreEntryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/new',
  component: ScoreEntry,
})

const scoreCardDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/$id',
  component: ScoreCardDetail,
})

const gearRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gear',
  component: Gear,
})

const leaguesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues',
  component: Leagues,
})

const leagueDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id',
  component: LeagueDetail,
})

const leagueSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id/settings',
  component: LeagueSettings,
})

const pelletTestingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing',
  component: PelletTesting,
})

const newPelletTestRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/new',
  component: NewPelletTest,
})

const pelletTestDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/$id',
  component: PelletTestDetail,
})

const pelletTestLeaderboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/leaderboard',
  component: PelletTestLeaderboard,
})

const pelletComparisonRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/compare',
  component: PelletComparison,
})

const batchReportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/batch-report',
  component: BatchReport,
})

const publicPelletLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pellet-leaderboard',
  component: PublicPelletLeaderboard,
})

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile',
  component: Profile,
})


const adminEmailSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/email/settings',
  component: AdminEmailSettings,
})

const adminEmailTemplatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/email/templates',
  component: AdminEmailTemplates,
})

// Unauthenticated shell (no nav, centred layout)
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
  beforeLoad: requireGuest,
})

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/login',
  component: Login,
})

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/register',
  component: Register,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  publicPelletLeaderboardRoute,
  appRoute.addChildren([
    scoreHistoryRoute,
    scoreEntryRoute,
    scoreCardDetailRoute,
    pelletTestingRoute,
    newPelletTestRoute,
    pelletTestDetailRoute,
    pelletTestLeaderboardRoute,
    pelletComparisonRoute,
    batchReportRoute,
    gearRoute,
    leaguesRoute,
    leagueDetailRoute,
    leagueSettingsRoute,
    profileRoute,
    adminEmailSettingsRoute,
    adminEmailTemplatesRoute,
  ]),
  authRoute.addChildren([loginRoute, registerRoute]),
])
