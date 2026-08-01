import React, { lazy, Suspense } from 'react'
import { createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import AuthLayout from './components/AuthLayout'
import IndexPage from './pages/IndexPage'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

// All pages except the critical render-path ones are lazy-loaded so they split
// into separate chunks, keeping the main entry below the 2 MiB Workbox
// precache ceiling.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lz = (C: React.LazyExoticComponent<any>) => () => (
  <Suspense fallback={<div className="p-6 text-sm text-muted">Loading…</div>}>
    <C />
  </Suspense>
)

const LazyScoreEntry = lazy(() => import('./pages/ScoreEntry'))
const LazyScoreHistory = lazy(() => import('./pages/ScoreHistory'))
const LazyScoreCompare = lazy(() => import('./pages/ScoreCompare'))
const LazyScoreCardDetail = lazy(() => import('./pages/ScoreCardDetail'))
const LazyScoreTrends = lazy(() => import('./pages/ScoreTrends'))
const LazyGear = lazy(() => import('./pages/Gear'))
const LazyRifleShowcase = lazy(() => import('./pages/GearShowcase').then(m => ({ default: m.RifleShowcase })))
const LazyPelletShowcase = lazy(() => import('./pages/GearShowcase').then(m => ({ default: m.PelletShowcase })))
const LazyLocations = lazy(() => import('./pages/Locations'))
const LazyLeagues = lazy(() => import('./pages/Leagues'))
const LazyLeagueDetail = lazy(() => import('./pages/LeagueDetail'))
const LazyLeagueSettings = lazy(() => import('./pages/LeagueSettings'))
const LazyPelletTesting = lazy(() => import('./pages/PelletTesting'))
const LazyPelletTestWizard = lazy(() => import('./pages/PelletTestWizard'))
const LazyPelletTestDetail = lazy(() => import('./pages/PelletTestDetail'))
const LazyPelletTestLeaderboard = lazy(() => import('./pages/PelletTestLeaderboard'))
const LazyPelletComparison = lazy(() => import('./pages/PelletComparison'))
const LazyBatchReport = lazy(() => import('./pages/BatchReport'))
const LazyPublicPelletLeaderboard = lazy(() => import('./pages/PublicPelletLeaderboard'))
const LazySharedScoreCardView = lazy(() => import('./pages/SharedView').then(m => ({ default: m.SharedScoreCardView })))
const LazySharedPelletTestView = lazy(() => import('./pages/SharedView').then(m => ({ default: m.SharedPelletTestView })))
const LazySharedLeagueView = lazy(() => import('./pages/SharedView').then(m => ({ default: m.SharedLeagueView })))
const LazySharedClubView = lazy(() => import('./pages/SharedView').then(m => ({ default: m.SharedClubView })))
const LazySharedUserView = lazy(() => import('./pages/SharedView').then(m => ({ default: m.SharedUserView })))
const LazyProfile = lazy(() => import('./pages/Profile'))
const LazyFollowManagement = lazy(() => import('./pages/FollowManagement'))
const LazyUserProfile = lazy(() => import('./pages/UserProfile'))
const LazyUsers = lazy(() => import('./pages/Users'))
const LazyFeed = lazy(() => import('./pages/Feed'))
const LazyRegister = lazy(() => import('./pages/Register'))
const LazyForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const LazyResetPassword = lazy(() => import('./pages/ResetPassword'))
const LazyTwoFactorChallenge = lazy(() => import('./pages/TwoFactorChallenge'))
const LazyAdminEmailSettings = lazy(() => import('./pages/AdminEmailSettings'))
const LazyAdminEmailTemplates = lazy(() => import('./pages/AdminEmailTemplates'))
const LazyAdminUsers = lazy(() => import('./pages/AdminUsers'))
const LazyAdminUserDetail = lazy(() => import('./pages/AdminUserDetail'))
const LazyAdminLeagues = lazy(() => import('./pages/AdminLeagues'))
const LazyAdminLeagueDetail = lazy(() => import('./pages/AdminLeagueDetail'))
const LazyAdminClubs = lazy(() => import('./pages/AdminClubs'))
const LazyAdminClubDetail = lazy(() => import('./pages/AdminClubDetail'))
const LazyAdminSitemap = lazy(() => import('./pages/AdminSitemap'))
const LazyAdminBackup = lazy(() => import('./pages/AdminBackup'))
const LazyAdminSimulation = lazy(() => import('./pages/AdminSimulation'))
const LazyAdminGear = lazy(() => import('./pages/AdminGearStats'))
const LazyAdminReportsQueue = lazy(() => import('./pages/AdminReportsQueue'))
const LazyAdminSupportInbox = lazy(() => import('./pages/AdminSupportInbox'))
const LazyAdminSupportTicketDetail = lazy(() => import('./pages/AdminSupportTicketDetail'))
const LazyAdminFaqs = lazy(() => import('./pages/AdminFaqs'))
const LazyAdminEvents = lazy(() => import('./pages/AdminEvents'))
const LazyConfirmEmail = lazy(() => import('./pages/ConfirmEmail'))
const LazyClubs = lazy(() => import('./pages/Clubs'))
const LazyClubDetail = lazy(() => import('./pages/ClubDetail'))
const LazyClubSettings = lazy(() => import('./pages/ClubSettings'))
const LazyLeagueReportsPage = lazy(() => import('./pages/CommunityReports').then(m => ({ default: m.LeagueReportsPage })))
const LazyClubReportsPage = lazy(() => import('./pages/CommunityReports').then(m => ({ default: m.ClubReportsPage })))
const LazyComboAnalytics = lazy(() => import('./pages/ComboAnalytics'))
const LazyNotifications = lazy(() => import('./pages/Notifications'))
const LazyPrivacyCenter = lazy(() => import('./pages/PrivacyCenter'))
const LazyNotificationSettings = lazy(() => import('./pages/NotificationSettings'))
const LazySecuritySettings = lazy(() => import('./pages/SecuritySettings'))
const LazyFeatureBoard = lazy(() => import('./pages/FeatureBoard'))
const LazyFeatureRequestDetail = lazy(() => import('./pages/FeatureRequestDetail'))
const LazySupportCenter = lazy(() => import('./pages/SupportCenter'))
const LazySupportTicketDetail = lazy(() => import('./pages/SupportTicketDetail'))
const LazyHelp = lazy(() => import('./pages/Help'))
const LazyPostDetail = lazy(() => import('./pages/PostDetail'))
const LazyQuickCapture = lazy(() => import('./pages/QuickCapture'))
const LazyDrafts = lazy(() => import('./pages/Drafts'))
const LazyPrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const LazyTermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const LazyCookiePolicy = lazy(() => import('./pages/CookiePolicy'))
const LazyEvents = lazy(() => import('./pages/Events'))
const LazyEventCreate = lazy(() => import('./pages/EventCreate'))
const LazyEventInvitationAccept = lazy(() => import('./pages/EventInvitationAccept'))
const LazyEventDetail = lazy(() => import('./pages/EventDetail'))
const LazyEventLive = lazy(() => import('./pages/EventLive'))
const LazyEventScorecard = lazy(() => import('./pages/EventScorecard'))
const LazyEventSettings = lazy(() => import('./pages/EventSettings'))

// Guard: redirect to /login if not authenticated.
// A session exists when we have either a live access token (current tab) or
// a persisted user record (returning user after a reload — the API client
// will mint a fresh access token via the httpOnly refresh cookie on the
// first 401, or punt to /login if the cookie is also gone).
function requireAuth() {
  const { accessToken, user } = useAuthStore.getState()
  if (!accessToken && !user) throw redirect({ to: '/login' })
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

const privacyPolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: lz(LazyPrivacyPolicy),
})

const termsOfUseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: lz(LazyTermsOfUse),
})

const cookiePolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cookies',
  component: lz(LazyCookiePolicy),
})

const scoreHistoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores',
  component: lz(LazyScoreHistory),
})

const scoreEntryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/new',
  component: lz(LazyScoreEntry),
  validateSearch: (search: Record<string, unknown>): { leagueId?: string; roundId?: string; draftId?: string } => ({
    leagueId: (search.leagueId as string) || undefined,
    roundId: (search.roundId as string) || undefined,
    draftId: (search.draftId as string) || undefined,
  }),
})

const scoreCompareRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/compare',
  component: lz(LazyScoreCompare),
  validateSearch: (search: Record<string, unknown>): { a?: string; b?: string } => ({
    a: (search.a as string) || undefined,
    b: (search.b as string) || undefined,
  }),
})

const quickCaptureRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/quick-capture',
  component: lz(LazyQuickCapture),
  validateSearch: (search: Record<string, unknown>): { type?: 'score' | 'pellet'; leagueId?: string; clubId?: string } => ({
    type: (search.type as 'score' | 'pellet') || undefined,
    leagueId: (search.leagueId as string) || undefined,
    clubId: (search.clubId as string) || undefined,
  }),
})

const draftsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/drafts',
  component: lz(LazyDrafts),
})

const scoreCardDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/$id',
  component: lz(LazyScoreCardDetail),
})

const gearRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gear',
  component: lz(LazyGear),
})

const rifleShowcaseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gear/rifles/$id',
  component: lz(LazyRifleShowcase),
})

const pelletShowcaseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gear/pellets/$id',
  component: lz(LazyPelletShowcase),
})

const locationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/locations',
  component: lz(LazyLocations),
})

const leaguesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues',
  component: lz(LazyLeagues),
})

const leagueDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id',
  component: lz(LazyLeagueDetail),
})

const leagueSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id/settings',
  component: lz(LazyLeagueSettings),
})

const leagueReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/leagues/$id/reports',
  component: lz(LazyLeagueReportsPage),
})

const eventsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events',
  component: lz(LazyEvents),
})

const eventCreateRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/new',
  component: lz(LazyEventCreate),
  validateSearch: (search: Record<string, unknown>): { clubId?: string } => ({
    clubId: typeof search.clubId === 'string' && search.clubId ? search.clubId : undefined,
  }),
})

const eventInvitationAcceptRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/invitations/$token',
  component: lz(LazyEventInvitationAccept),
})

const eventDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/$slug',
  component: lz(LazyEventDetail),
})

const eventLiveRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/$slug/live',
  component: lz(LazyEventLive),
})

const eventScorecardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/$slug/scorecard',
  component: lz(LazyEventScorecard),
})

const eventSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/events/$slug/settings',
  component: lz(LazyEventSettings),
})

const adminEventsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/events',
  component: lz(LazyAdminEvents),
})

const pelletTestingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing',
  component: lz(LazyPelletTesting),
  validateSearch: (search: Record<string, unknown>): { tab?: 'overview' | 'tests' | 'combos' | 'batches' } => {
    const t = search.tab
    if (t === 'tests' || t === 'combos' || t === 'batches' || t === 'overview') return { tab: t }
    return {}
  },
})

const newPelletTestRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/new',
  component: lz(LazyPelletTestWizard),
  validateSearch: (search: Record<string, unknown>): { draftId?: string; step?: number; imageId?: string } => {
    const stepRaw = search.step
    const stepNum = typeof stepRaw === 'number' ? stepRaw : typeof stepRaw === 'string' ? parseInt(stepRaw, 10) : undefined
    const step = Number.isFinite(stepNum) && stepNum! >= 1 && stepNum! <= 5 ? stepNum : undefined
    return {
      draftId: (search.draftId as string) || undefined,
      step,
      imageId: (search.imageId as string) || undefined,
    }
  },
})

const pelletTestDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/$id',
  component: lz(LazyPelletTestDetail),
})

const pelletTestLeaderboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/leaderboard',
  component: lz(LazyPelletTestLeaderboard),
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'combos' } })
  },
})

const pelletComparisonRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/compare',
  component: lz(LazyPelletComparison),
})

const batchReportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/batch-report',
  component: lz(LazyBatchReport),
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'batches' } })
  },
})

const publicPelletLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pellet-leaderboard',
  component: lz(LazyPublicPelletLeaderboard),
})

// Canonical public share URLs. The `ShareDialog` points at these paths when
// "Share externally" is used, and the backend injects entity-specific Open
// Graph tags here so social platforms render rich previews. Logged-in users
// are redirected to the full in-app experience; anonymous visitors get a
// minimal read-only preview plus a sign-in CTA.
const sharedScoreCardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/score-cards/$id',
  component: lz(LazySharedScoreCardView),
})

const sharedPelletTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pellet-tests/$id',
  component: lz(LazySharedPelletTestView),
})

const sharedLeagueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/leagues/$id',
  component: lz(LazySharedLeagueView),
})

const sharedClubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/clubs/$id',
  component: lz(LazySharedClubView),
})

const sharedUserRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/users/$id',
  component: lz(LazySharedUserView),
})

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile',
  component: lz(LazyProfile),
})

const profileFollowsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile/follows',
  component: lz(LazyFollowManagement),
})

const userProfileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/$id',
  component: lz(LazyUserProfile),
})

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  component: lz(LazyUsers),
})

const feedRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feed',
  component: lz(LazyFeed),
})

const postDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/posts/$id',
  component: lz(LazyPostDetail),
})

const clubsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs',
  component: lz(LazyClubs),
})

const clubDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id',
  component: lz(LazyClubDetail),
})

const clubSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id/settings',
  component: lz(LazyClubSettings),
})

const clubReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clubs/$id/reports',
  component: lz(LazyClubReportsPage),
})

const scoreTrendsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/scores/trends',
  component: lz(LazyScoreTrends),
  validateSearch: (search: Record<string, unknown>): { period?: 'week' | 'month'; rifleId?: string } => ({
    period: search.period === 'month' ? 'month' : search.period === 'week' ? 'week' : undefined,
    rifleId: (search.rifleId as string) || undefined,
  }),
})

const comboAnalyticsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pellet-testing/combo-analytics',
  component: lz(LazyComboAnalytics),
  beforeLoad: () => {
    throw redirect({ to: '/pellet-testing', search: { tab: 'combos' } })
  },
})


const adminEmailSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/email/settings',
  component: lz(LazyAdminEmailSettings),
})

const adminEmailTemplatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/email/templates',
  component: lz(LazyAdminEmailTemplates),
})

const adminUsersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/users',
  component: lz(LazyAdminUsers),
})

const adminUserDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/users/$id',
  component: lz(LazyAdminUserDetail),
})

const adminLeaguesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/leagues',
  component: lz(LazyAdminLeagues),
})

const adminLeagueDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/leagues/$id',
  component: lz(LazyAdminLeagueDetail),
})

const adminClubsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/clubs',
  component: lz(LazyAdminClubs),
})

const adminClubDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/clubs/$id',
  component: lz(LazyAdminClubDetail),
})

const adminSitemapRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/sitemap',
  component: lz(LazyAdminSitemap),
})

const adminBackupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/backup',
  component: lz(LazyAdminBackup),
})

const adminSimulationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/simulation',
  component: lz(LazyAdminSimulation),
})

const adminGearRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/gear',
  component: lz(LazyAdminGear),
})

const adminReportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/reports',
  component: lz(LazyAdminReportsQueue),
})

const adminSupportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/support',
  component: lz(LazyAdminSupportInbox),
})

const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notifications',
  component: lz(LazyNotifications),
})

const settingsPrivacyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/privacy',
  component: lz(LazyPrivacyCenter),
})

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/notifications',
  component: lz(LazyNotificationSettings),
})

const settingsSecurityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/security',
  component: lz(LazySecuritySettings),
})

const featureBoardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feature-requests',
  component: lz(LazyFeatureBoard),
})

const featureRequestDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/feature-requests/$id',
  component: lz(LazyFeatureRequestDetail),
})

const supportCenterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/support',
  component: lz(LazySupportCenter),
})

const supportTicketDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/support/tickets/$id',
  component: lz(LazySupportTicketDetail),
})

const adminSupportTicketDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/support/tickets/$id',
  component: lz(LazyAdminSupportTicketDetail),
})

const helpRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/help',
  component: lz(LazyHelp),
})

const adminFaqsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/faqs',
  component: lz(LazyAdminFaqs),
})

const confirmEmailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/confirm-email',
  component: lz(LazyConfirmEmail),
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
  component: lz(LazyRegister),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/forgot-password',
  component: lz(LazyForgotPassword),
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/reset-password',
  component: lz(LazyResetPassword),
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: (search.token as string) || undefined,
  }),
})

const twoFactorChallengeRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/login/2fa',
  component: lz(LazyTwoFactorChallenge),
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  privacyPolicyRoute,
  termsOfUseRoute,
  cookiePolicyRoute,
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
    rifleShowcaseRoute,
    pelletShowcaseRoute,
    locationsRoute,
    leaguesRoute,
    leagueDetailRoute,
    leagueSettingsRoute,
    leagueReportsRoute,
    eventsRoute,
    eventCreateRoute,
    eventInvitationAcceptRoute,
    eventDetailRoute,
    eventLiveRoute,
    eventScorecardRoute,
    eventSettingsRoute,
    adminEventsRoute,
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
    adminBackupRoute,
    adminSimulationRoute,
    adminGearRoute,
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
