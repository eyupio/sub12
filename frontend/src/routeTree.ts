import { createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import AuthLayout from './components/AuthLayout'
import IndexPage from './pages/IndexPage'
import ScoreEntry from './pages/ScoreEntry'
import ScoreHistory from './pages/ScoreHistory'
import ScoreCompare from './pages/ScoreCompare'
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
import {
  SharedScoreCardView,
  SharedPelletTestView,
  SharedLeagueView,
  SharedClubView,
  SharedUserView,
} from './pages/SharedView'
import Profile from './pages/Profile'
import FollowManagement from './pages/FollowManagement'
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
import SecuritySettings from './pages/SecuritySettings'
import TwoFactorChallenge from './pages/TwoFactorChallenge'
import { LeagueReportsPage, ClubReportsPage } from './pages/CommunityReports'
import NotFound from './pages/NotFound'
import FeatureBoard from './pages/FeatureBoard'
import FeatureRequestDetail from './pages/FeatureRequestDetail'
import SupportCenter from './pages/SupportCenter'
import SupportTicketDetail from './pages/SupportTicketDetail'
import AdminSupportTicketDetail from './pages/AdminSupportTicketDetail'
import Help from './pages/Help'
import AdminFaqs from './pages/AdminFaqs'
import PostDetail from './pages/PostDetail'
import QuickCapture from './pages/QuickCapture'
import Drafts from './pages/Drafts'

// Guard: redirect to /login if not authenticated.
// A session exists when we have either a live access token (current tab) or
// a persisted refresh token (returning user after a reload — the access token
// is no longer persisted to localStorage, so the API client will mint a fresh
// one on the first 401).
function requireAuth() {
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (!accessToken && !refreshToken) throw redirect({ to: '/login' })
}

// Guard: redirect to / if already authenticated
function requireGuest() {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) throw redirect({ to: '/' })
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
  validateSearch: (search: Record<string, unknown>): { leagueId?: string; roundId?: string; draftId?: string } => ({
    leagueId: (search.leagueId as string) || undefined,
    roundId: (search.roundId as string) || undefined,
    draftId: (search.draftId as string) || undefined,
  }),
})

const scoreCompareRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/compare',
  component: ScoreCompare,
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: (search.a as string) || undefined,
    b: (search.b as string) || undefined,
  }),
})

const quickCaptureRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/quick-capture',
  component: QuickCapture,
  validateSearch: (search: Record<string, unknown>): { type?: 'score' | 'pellet'; leagueId?: string; clubId?: string } => ({
    type: (search.type as 'score' | 'pellet') || undefined,
    leagueId: (search.leagueId as string) || undefined,
    clubId: (search.clubId as string) || undefined,
  }),
})

const draftsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/drafts',
  component: Drafts,
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
  validateSearch: (search: Record<string, unknown>): { tab?: 'overview' | 'tests' | 'combos' | 'batches' } => {
    const t = search.tab
    if (t === 'tests' || t === 'combos' || t === 'batches' || t === 'overview') return { tab: t }
    return {}
  },
})

const newPelletTestRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/new',
  component: NewPelletTest,
  validateSearch: (search: Record<string, unknown>): { draftId?: string } => ({
    draftId: (search.draftId as string) || undefined,
  }),
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
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'combos' } })
  },
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
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'batches' } })
  },
})

const publicPelletLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pellet-leaderboard',
  component: PublicPelletLeaderboard,
})

// Canonical public share URLs. The `ShareDialog` points at these paths when
// "Share externally" is used, and the backend injects entity-specific Open
// Graph tags here so social platforms render rich previews. Logged-in users
// are redirected to the full in-app experience; anonymous visitors get a
// minimal read-only preview plus a sign-in CTA.
const sharedScoreCardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/score-cards/$id',
  component: SharedScoreCardView,
})

const sharedPelletTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pellet-tests/$id',
  component: SharedPelletTestView,
})

const sharedLeagueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/leagues/$id',
  component: SharedLeagueView,
})

const sharedClubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/clubs/$id',
  component: SharedClubView,
})

const sharedUserRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/users/$id',
  component: SharedUserView,
})

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile',
  component: Profile,
})

const profileFollowsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile/follows',
  component: FollowManagement,
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

const postDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/posts/$id',
  component: PostDetail,
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
  validateSearch: (search: Record<string, unknown>): { period?: 'week' | 'month'; rifleId?: string } => ({
    period: search.period === 'month' ? 'month' : search.period === 'week' ? 'week' : undefined,
    rifleId: (search.rifleId as string) || undefined,
  }),
})

const comboAnalyticsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/combo-analytics',
  component: ComboAnalytics,
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'combos' } })
  },
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

const settingsSecurityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/security',
  component: SecuritySettings,
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

const helpRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/help',
  component: Help,
})

const adminFaqsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/faqs',
  component: AdminFaqs,
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

const twoFactorChallengeRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/login/2fa',
  component: TwoFactorChallenge,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  publicPelletLeaderboardRoute,
  sharedScoreCardRoute,
  sharedPelletTestRoute,
  sharedLeagueRoute,
  sharedClubRoute,
  sharedUserRoute,
  appRoute.addChildren([
    scoreHistoryRoute,
    scoreEntryRoute,
    scoreCompareRoute,
    quickCaptureRoute,
    draftsRoute,
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
    profileFollowsRoute,
    userProfileRoute,
    usersRoute,
    feedRoute,
    postDetailRoute,
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
    settingsSecurityRoute,
    helpRoute,
    adminFaqsRoute,
    confirmEmailRoute,
  ]),
  authRoute.addChildren([loginRoute, registerRoute, forgotPasswordRoute, resetPasswordRoute, twoFactorChallengeRoute]),
])
