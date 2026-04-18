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
import UserProfile from './pages/UserProfile'
import Users from './pages/Users'
import Feed from './pages/Feed'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminEmailSettings from './pages/AdminEmailSettings'
import AdminEmailTemplates from './pages/AdminEmailTemplates'
import AdminUsers from './pages/AdminUsers'
import AdminUserDetail from './pages/AdminUserDetail'
import AdminLeagues from './pages/AdminLeagues'
import AdminLeagueDetail from './pages/AdminLeagueDetail'
import AdminClubs from './pages/AdminClubs'
import AdminClubDetail from './pages/AdminClubDetail'
import AdminSitemap from './pages/AdminSitemap'
import AdminReportsQueue from './pages/AdminReportsQueue'
import AdminSupportInbox from './pages/AdminSupportInbox'
import ConfirmEmail from './pages/ConfirmEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Clubs from './pages/Clubs'
import ClubDetail from './pages/ClubDetail'
import ClubSettings from './pages/ClubSettings'
import ScoreTrends from './pages/ScoreTrends'
import ComboAnalytics from './pages/ComboAnalytics'
import Notifications from './pages/Notifications'
import PrivacyCenter from './pages/PrivacyCenter'
import NotificationSettings from './pages/NotificationSettings'
import { LeagueReportsPage, ClubReportsPage } from './pages/CommunityReports'
import NotFound from './pages/NotFound'
import FeatureBoard from './pages/FeatureBoard'
import FeatureRequestDetail from './pages/FeatureRequestDetail'
import SupportCenter from './pages/SupportCenter'
import SupportTicketDetail from './pages/SupportTicketDetail'
import AdminSupportTicketDetail from './pages/AdminSupportTicketDetail'

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

const rootRoute = createRootRoute({
  notFoundComponent: NotFound,
})

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
  validateSearch: (search: Record<string, unknown>): { leagueId?: string; roundId?: string } => ({
    leagueId: (search.leagueId as string) || undefined,
    roundId: (search.roundId as string) || undefined,
  }),
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

const leagueReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id/reports',
  component: LeagueReportsPage,
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

const userProfileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/$id',
  component: UserProfile,
})

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  component: Users,
})

const feedRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feed',
  component: Feed,
})

const clubsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs',
  component: Clubs,
})

const clubDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id',
  component: ClubDetail,
})

const clubSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id/settings',
  component: ClubSettings,
})

const clubReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id/reports',
  component: ClubReportsPage,
})

const scoreTrendsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/trends',
  component: ScoreTrends,
})

const comboAnalyticsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/combo-analytics',
  component: ComboAnalytics,
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

const adminUsersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/users',
  component: AdminUsers,
})

const adminUserDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/users/$id',
  component: AdminUserDetail,
})

const adminLeaguesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/leagues',
  component: AdminLeagues,
})

const adminLeagueDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/leagues/$id',
  component: AdminLeagueDetail,
})

const adminClubsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/clubs',
  component: AdminClubs,
})

const adminClubDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/clubs/$id',
  component: AdminClubDetail,
})

const adminSitemapRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/sitemap',
  component: AdminSitemap,
})

const adminReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/reports',
  component: AdminReportsQueue,
})

const adminSupportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/support',
  component: AdminSupportInbox,
})

const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notifications',
  component: Notifications,
})

const settingsPrivacyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/privacy',
  component: PrivacyCenter,
})

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/notifications',
  component: NotificationSettings,
})

const featureBoardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feature-requests',
  component: FeatureBoard,
})

const featureRequestDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feature-requests/$id',
  component: FeatureRequestDetail,
})

const supportCenterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/support',
  component: SupportCenter,
})

const supportTicketDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/support/tickets/$id',
  component: SupportTicketDetail,
})

const adminSupportTicketDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/support/tickets/$id',
  component: AdminSupportTicketDetail,
})

const confirmEmailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/confirm-email',
  component: ConfirmEmail,
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: (search.token as string) || undefined,
  }),
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

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/forgot-password',
  component: ForgotPassword,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/reset-password',
  component: ResetPassword,
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: (search.token as string) || undefined,
  }),
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  publicPelletLeaderboardRoute,
  appRoute.addChildren([
    scoreHistoryRoute,
    scoreEntryRoute,
    scoreCardDetailRoute,
    scoreTrendsRoute,
    pelletTestingRoute,
    newPelletTestRoute,
    pelletTestDetailRoute,
    pelletTestLeaderboardRoute,
    pelletComparisonRoute,
    batchReportRoute,
    comboAnalyticsRoute,
    gearRoute,
    leaguesRoute,
    leagueDetailRoute,
    leagueSettingsRoute,
    leagueReportsRoute,
    clubsRoute,
    clubDetailRoute,
    clubSettingsRoute,
    clubReportsRoute,
    profileRoute,
    userProfileRoute,
    usersRoute,
    feedRoute,
    adminEmailSettingsRoute,
    adminEmailTemplatesRoute,
    adminUsersRoute,
    adminUserDetailRoute,
    adminLeaguesRoute,
    adminLeagueDetailRoute,
    adminClubsRoute,
    adminClubDetailRoute,
    adminSitemapRoute,
    adminReportsRoute,
    adminSupportRoute,
    adminSupportTicketDetailRoute,
    notificationsRoute,
    supportCenterRoute,
    supportTicketDetailRoute,
    featureBoardRoute,
    featureRequestDetailRoute,
    settingsPrivacyRoute,
    settingsNotificationsRoute,
    confirmEmailRoute,
  ]),
  authRoute.addChildren([loginRoute, registerRoute, forgotPasswordRoute, resetPasswordRoute]),
])
