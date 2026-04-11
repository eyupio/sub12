import { createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import AuthLayout from './components/AuthLayout'
import Dashboard from './pages/Dashboard'
import ScoreEntry from './pages/ScoreEntry'
import Leagues from './pages/Leagues'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Register from './pages/Register'

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
  getParentRoute: () => appRoute,
  path: '/',
  component: Dashboard,
})

const scoreEntryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/new',
  component: ScoreEntry,
})

const leaguesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues',
  component: Leagues,
})

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile',
  component: Profile,
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
  appRoute.addChildren([indexRoute, scoreEntryRoute, leaguesRoute, profileRoute]),
  authRoute.addChildren([loginRoute, registerRoute]),
])
