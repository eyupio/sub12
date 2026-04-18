// Single source of truth for tooltip copy. Keeping every string here lets
// editors iterate on wording without hunting through dozens of pages.

export const pageHelp = {
  dashboard: 'Your home view: latest scores, active leagues, and quick actions. The top-left logo always brings you back here.',
  feed: 'Activity from people, leagues, and clubs you follow. Switch between Public, For You, League, and Club tabs.',
  scores: 'Every score card you have logged. Tap a row to view, edit, verify, amend, or share it.',
  scoreEntry: 'Log a 25-shot card. Pick rifle and pellet, optionally attach a photo, and set the score\'s visibility.',
  scoreDetail: 'Single score view. Verify, amend, or reject (for league admins) and see the audit trail for any changes.',
  scoreTrends: 'Your score performance over time. Filter by rifle and pick weekly or monthly buckets.',
  pelletTesting: 'Test sessions you have logged. Each test captures groups on paper and converts sizes to MOA automatically.',
  newPelletTest: 'Start a new test session. Capture distance, rifle, pellet, conditions, and one or more groups.',
  pelletTestDetail: 'Walk through groups, measure by photo (hole detection) or manually, and compare MOA across the session.',
  pelletLeaderboard: 'Pellets ranked by best group and consistency for each of your rifles.',
  pelletCompare: 'Side-by-side comparison of two pellets in the same rifle.',
  comboAnalytics: 'Which rifle + pellet combos perform best for you, ranked by group size and consistency.',
  batchReport: 'Compare performance across pellet batches and lot numbers.',
  publicLeaderboard: 'Community-sourced anonymized leaderboard. Opt in from any of your tests.',
  leagues: 'Leagues you can join or have joined. Create your own with custom scoring and join rules.',
  leagueDetail: 'League standings, submitted scores, and posts. Admins verify and amend scores from here.',
  leagueSettings: 'League admin controls: image, scoring rule, visibility, join policy, members.',
  leagueReports: 'Moderation queue for reports inside this league.',
  clubs: 'Clubs are long-lived communities that can run multiple leagues. Join one or start your own.',
  clubDetail: 'Club standings, members, and posts. Admins manage members and run leagues from here.',
  clubSettings: 'Club admin controls: image, timezone, join policy, member roles.',
  clubReports: 'Moderation queue for reports inside this club.',
  gear: 'Your rifles and pellets. Set a primary rifle, search the catalog, and see per-item performance stats.',
  profile: 'Your public profile: stats, achievements, and bio. Edit display name, avatar, and preferences here.',
  userProfile: 'Another user\'s public profile. Follow, view their stats and achievements.',
  users: 'Find and follow other shooters.',
  feed_filters: 'Choose whose activity to see.',
  notifications: 'Your in-app notifications. Filter by type and click through to the source.',
  privacy: 'Control who can see your profile and scores, manage data export, and delete your account.',
  notificationSettings: 'Choose which events notify you in-app or by email.',
  support: 'Ask a question, report an issue, or request a feature. Tickets route to the right admins.',
  supportTicket: 'A single support thread. Reply, mark read, or delete.',
  featureBoard: 'Browse and vote on community feature requests.',
  help: 'Searchable knowledge base covering every feature in sub12.',
  adminEmailTemplates: 'Edit every transactional email. Preview with test data before saving.',
  adminEmailSettings: 'Configure the SMTP server used to send all outbound email.',
  adminUsers: 'All users on the platform. Change roles or delete accounts.',
  adminLeagues: 'All leagues on the platform.',
  adminClubs: 'All clubs on the platform.',
  adminSitemap: 'Sitemap generation stats and IndexNow submissions.',
  adminReports: 'Platform-wide moderation queue.',
  adminSupport: 'Platform-wide support ticket inbox.',
  adminFaqs: 'Create, edit, reorder, and publish help articles. Answers are markdown and render live in the preview pane.',
} as const

export const tips = {
  // Score entry / detail
  scoreVisibility: 'Who can see this score. You can set a default in Privacy Center.',
  scoreLeague: 'Attach this score to a specific league round so it counts for standings.',
  scoreVerify: 'Mark this score as verified. It will count toward the league standings.',
  scoreAmend: 'Change the value of a verified score. The original stays in the audit trail alongside your reason.',
  scoreReject: 'Reject this score so it does not count. The submitter sees your reason.',
  scoreAuditTrail: 'Log of every verify, amend, and reject action on this score.',

  // Pellet testing
  detectHoles: 'Find shot holes in your target photo automatically. You can adjust results by hand afterwards.',
  holeConfidence: 'How confident the automatic detection is. Low = retake the photo with better lighting and angle.',
  manualMeasurement: 'Enter group size by hand (for example, from a caliper reading). Bypasses image detection.',
  moa: 'Minute of Angle. ~1 inch at 100 yards. Lets you compare groups shot at different distances.',
  distanceUnit: 'Meters or yards. Both convert to MOA automatically.',
  leaderboardOptIn: 'Include this test (anonymously) in the public pellet leaderboard.',

  // Leagues
  scoringHighest: 'Only your best card in the round counts. Rewards peak performance.',
  scoringAverage: 'The mean of all cards in the round counts. Rewards consistency.',
  joinOpen: 'Anyone can join immediately.',
  joinCode: 'Only people with the invite code can join.',
  joinApproval: 'People request to join; admins approve or decline.',
  inviteCodeCopy: 'Copy the invite code. Regenerating it invalidates the old one.',

  // Club
  clubVisibilityPublic: 'Anyone can find and view the club.',
  clubVisibilityPrivate: 'Hidden from search. Members only.',

  // Privacy
  privacyProfile: 'Private profiles are hidden from search and require follow approval.',
  privacyDefaultScore: 'Default visibility applied to new scores. You can still override per-score.',
  privacyFeedOptOut: 'Hide your activity from the public feed without making your profile private.',
  privacyFollowerCounts: 'Show or hide follower/following counts on your profile.',

  // Notifications
  notifInApp: 'Show a bell notification inside the app.',
  notifEmail: 'Send an email when this event happens.',

  // Profile
  avatarUpload: 'Upload a square image. Shown on your profile and in activity feeds.',
  dateFormat: 'How dates display across the app for you.',

  // Gear
  catalogSearch: 'Search the built-in catalog. Picking a match pre-fills specs.',
  primaryRifle: 'Your default rifle, auto-selected when logging scores and tests.',

  // Feed
  feedFilterPublic: 'All public activity across sub12.',
  feedFilterForYou: 'Activity from people, leagues, and clubs you follow.',
  feedFilterLeague: 'Activity scoped to one of your leagues.',
  feedFilterClub: 'Activity scoped to one of your clubs.',

  // Layout
  notificationBell: 'In-app notifications. Red dot means unread.',
  themeToggle: 'Switch between light, dark, and system theme.',
  logout: 'Sign out of this device.',
  homeLogo: 'Go to your dashboard.',
} as const

export type PageHelpKey = keyof typeof pageHelp
export type TipKey = keyof typeof tips
