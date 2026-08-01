package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/api/handler"
	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/config"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// NewRouter builds and returns the application HTTP router.
func NewRouter(
	cfg *config.Config,
	log zerolog.Logger,
	db handler.Pinger,
	auth *service.AuthService,
	scoreCards *service.ScoreCardService,
	stats *service.StatsService,
	rifles *service.RifleService,
	pellets *service.PelletService,
	users *service.UserService,
	social *service.SocialService,
	leagues *service.LeagueService,
	pelletTests *service.PelletTestService,
	comments *service.CommentService,
	activity *service.ActivityService,
	achievements *service.AchievementService,
	smtp *service.SMTPService,
	emailTemplates *service.EmailTemplateService,
	emailSender *service.EmailSenderService,
	clubs *service.ClubService,
	blocks *service.BlockService,
	likes *service.LikeService,
	posts *service.PostService,
	notifications *service.NotificationService,
	devices *service.DeviceService,
	moderation *service.ModerationService,
	supportTickets *service.SupportTicketService,
	featureRequests *service.FeatureRequestService,
	faqs *service.FAQService,
	sitemap *service.SitemapService,
	mutes *repository.MuteRepository,
	rl *middleware.RateLimiter,
	images *repository.ImageRepository,
	twoFactor *service.TwoFactorService,
	communityReview *service.CommunityReviewService,
	locations *service.LocationService,
	backups *service.BackupService,
	backupRepo *repository.BackupRepository,
	categories *service.CategoryService,
	events *service.EventService,
	eventInvitations *service.EventInvitationService,
	simulation *service.SimulationService,
	gearShowcase *service.GearShowcaseService,
	adminGear *service.AdminGearService,
) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestLogger(log))
	r.Use(chimiddleware.Recoverer)
	r.Use(securityHeadersMiddleware(cfg.Env))
	r.Use(corsMiddleware(cfg.CORSOrigin))

	// Health probes (no auth)
	h := handler.NewHealth(db)
	r.Get("/healthz", h.Liveness)
	r.Get("/readyz", h.Readiness)

	// Public sitemap.xml (no auth)
	sitemapH := handler.NewSitemap(sitemap)
	r.Get("/sitemap.xml", sitemapH.ServeXML)
	// Legacy typo compatibility for old links/tools.
	r.Get("/siteindex.xml", sitemapH.ServeXML)
	// IndexNow key-file verification endpoint.
	r.Get("/{key}.txt", sitemapH.ServeIndexNowKeyFile)

	// Share-meta: serves the SPA shell with entity-specific Open Graph and
	// Twitter card tags injected into <head>. Backs the canonical public
	// URLs for shareable content. Humans get the working SPA (tags are
	// invisible); crawlers render rich previews. The response is the same
	// for both — no user-agent sniffing.
	shareMeta := handler.NewShareMeta(scoreCards, pelletTests, leagues, clubs, users, rifles, pellets, achievements, cfg.SiteURL, cfg.FrontendOrigin, log)
	r.Get("/score-cards/{id}", shareMeta.ScoreCard())
	r.Get("/pellet-tests/{id}", shareMeta.PelletTest())
	// League/club/user canonical URLs stay authed for in-app navigation;
	// the dedicated /share/* paths are what the ShareDialog links to and
	// what the backend injects OG tags for.
	r.Get("/share/leagues/{id}", shareMeta.League())
	r.Get("/share/clubs/{id}", shareMeta.Club())
	r.Get("/share/users/{id}", shareMeta.User())

	// Branded OG preview images. Rendered per-entity PNGs that social
	// platforms embed in link previews. Privacy checks mirror share-meta;
	// private / missing entities fall through to the site default.
	ogImage, err := handler.NewOGImage(scoreCards, pelletTests, leagues, clubs, users, rifles, pellets, log)
	if err != nil {
		log.Fatal().Err(err).Msg("init og image handler")
	}
	r.Get("/og/score-cards/{id}.png", ogImage.ScoreCard())
	r.Get("/og/pellet-tests/{id}.png", ogImage.PelletTest())
	r.Get("/og/leagues/{id}.png", ogImage.League())
	r.Get("/og/clubs/{id}.png", ogImage.Club())
	r.Get("/og/users/{id}.png", ogImage.User())

	// Versioned API
	r.Route("/api/v1", func(r chi.Router) {
		// Pre-instantiate comment handler so it can be used in both protected and public groups
		commentH := handler.NewComment(comments)
		// Public auth routes. Password-bearing endpoints are rate-limited
		// per-IP to blunt credential stuffing and password-reset flooding.
		// /auth/refresh and /auth/logout are intentionally unbounded here so
		// that normal token-refresh traffic from returning users isn't
		// throttled shared with login attempts on the same IP.
		authHandler := handler.NewAuth(auth, cfg.Env == "production")
		r.With(rl.Limit("auth")).Post("/auth/register", authHandler.Register)
		r.With(rl.Limit("auth")).Post("/auth/login", authHandler.Login)
		r.With(rl.Limit("auth")).Post("/auth/login/2fa", authHandler.LoginVerify2FA)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Post("/auth/logout", authHandler.Logout)
		r.With(rl.Limit("auth")).Post("/auth/forgot-password", authHandler.ForgotPassword)
		r.With(rl.Limit("auth")).Post("/auth/reset-password", authHandler.ResetPassword)

		// Public image serving (no auth required)
		ih := handler.NewImage(images, log)
		r.Get("/images/{id}", ih.Serve)

		// Public FAQ routes (no auth required)
		faqH := handler.NewFAQ(faqs)
		r.Get("/faqs", faqH.ListPublic)
		r.Get("/faqs/{slug}", faqH.GetBySlug)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(auth))

			r.Get("/me", authHandler.Me)

			// Images
			r.Post("/images", ih.Upload)

			// Stats
			sh := handler.NewStats(stats)
			r.Get("/users/me/stats", sh.GetMe)
			r.Get("/users/me/rifle-stats", sh.GetRifleStats)
			r.Get("/users/me/score-trends", sh.GetScoreTrends)

			// Score cards (mutations — reads are public via OptionalAuthenticate below)
			sc := handler.NewScoreCard(scoreCards, images)
			r.Post("/score-cards", sc.Create)
			r.Post("/score-cards/quick", sc.QuickCreate)
			r.Get("/score-cards", sc.List)
			r.Get("/score-cards/drafts/count", sc.DraftCount)
			r.Patch("/score-cards/{id}", sc.Update)
			r.Post("/score-cards/{id}/graduate", sc.Graduate)
			r.Delete("/score-cards/{id}", sc.Delete)
			r.Post("/score-cards/{id}/image", sc.UploadImage)
			r.Post("/score-cards/{id}/rotate", sc.Rotate)
			r.Post("/score-cards/{id}/submit-to-league", sc.SubmitToLeague)

			// Rifles
			rh := handler.NewRifle(rifles, images)
			r.Post("/rifles", rh.Create)
			r.Get("/rifles", rh.List)
			r.Patch("/rifles/{id}", rh.Update)
			r.Delete("/rifles/{id}", rh.Delete)
			r.Post("/rifles/{id}/image", rh.UploadImage)

			// Gear showcase: per-item detail pages with cross-user comparison.
			gsh := handler.NewGearShowcase(gearShowcase)
			r.Get("/rifles/{id}/showcase", gsh.Rifle)
			r.Patch("/users/me/gear-comparison", gsh.SetOptInAll)

			// Pellets
			ph := handler.NewPellet(pellets, images)
			r.Post("/pellets", ph.Create)
			r.Get("/pellets", ph.List)
			r.Patch("/pellets/{id}", ph.Update)
			r.Delete("/pellets/{id}", ph.Delete)
			r.Post("/pellets/{id}/image", ph.UploadImage)
			r.Get("/pellets/{id}/showcase", gsh.Pellet)

			// Locations
			locH := handler.NewLocation(locations, images)
			r.Post("/locations", locH.Create)
			r.Get("/locations", locH.List)
			r.Get("/locations/{id}", locH.GetByID)
			r.Patch("/locations/{id}", locH.Update)
			r.Delete("/locations/{id}", locH.Delete)
			r.Post("/locations/{id}/image", locH.UploadImage)

			// Pellet tests (mutations — reads are public via OptionalAuthenticate below)
			pth := handler.NewPelletTest(pelletTests, images)
			r.Get("/pellet-tests/leaderboard", pth.Leaderboard)
			r.Get("/pellet-tests/stats", pth.Stats)
			r.Get("/pellet-tests/compare", pth.Compare)
			r.Get("/pellet-tests/timeline", pth.Timeline)
			r.Get("/pellet-tests/confidence", pth.ConfidenceBadge)
			r.Get("/pellet-tests/batch-report", pth.BatchReport)
			r.Get("/pellet-tests/combo-analytics", pth.ComboAnalytics)
			r.Post("/pellet-tests", pth.Create)
			r.Post("/pellet-tests/quick", pth.QuickCreate)
			r.Get("/pellet-tests", pth.List)
			r.Get("/pellet-tests/drafts/count", pth.DraftCount)
			r.Patch("/pellet-tests/{id}", pth.Update)
			r.Post("/pellet-tests/{id}/graduate", pth.Graduate)
			r.Delete("/pellet-tests/{id}", pth.Delete)
			r.Get("/pellet-tests/{id}/export", pth.Export)
			r.Post("/pellet-tests/{id}/groups", pth.CreateGroup)
			r.Patch("/pellet-tests/{id}/groups/{groupId}", pth.UpdateGroup)
			r.Delete("/pellet-tests/{id}/groups/{groupId}", pth.DeleteGroup)
			r.Post("/pellet-tests/{id}/images", pth.UploadImage)
			r.Delete("/pellet-tests/{id}/images/{imageId}", pth.DeleteImage)
			r.Post("/pellet-tests/{id}/images/{imageId}/measurements", pth.CreateMeasurement)
			r.Get("/pellet-tests/{id}/images/{imageId}/measurements", pth.GetMeasurements)
			r.Patch("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}", pth.UpdateMeasurement)
			r.Delete("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}", pth.DeleteMeasurement)
			r.Get("/pellet-tests/{id}/scoring", pth.GetSessionScoring)
			r.Post("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/detections", pth.CreateDetections)
			r.Put("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/detections", pth.ReplaceDetections)
			r.Get("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/detections", pth.ListDetections)
			r.Post("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/annotate", pth.UploadAnnotatedImage)
			r.Patch("/pellet-tests/{id}/detections/{detectionId}", pth.UpdateDetection)
			r.Delete("/pellet-tests/{id}/detections/{detectionId}", pth.DeleteDetection)

			// User profiles (auth-only mutations; reads are public via OptionalAuthenticate below)
			uh := handler.NewUser(users, social, images)
			r.Patch("/users/me", uh.UpdateMe)
			r.Post("/users/me/avatar", uh.UploadAvatar)
			r.Delete("/users/me/avatar", uh.DeleteAvatar)
			// Rate-limited: RequestEmailChange sends a confirmation email to
			// an attacker-controlled address and returns a 409 when the new
			// address is already registered, so unbounded access lets an
			// authenticated user amplify outbound email and enumerate
			// registered accounts. Confirm consumes an issued token only and
			// is left alone.
			r.With(rl.Limit("auth")).Post("/users/me/email", uh.RequestEmailChange)
			r.Post("/users/me/email/confirm", uh.ConfirmEmailChange)
			r.Delete("/users/me", uh.DeleteMe)
			r.Post("/users/me/export", uh.RequestExport)
			r.Get("/users/me/export/{id}", uh.GetExport)
			r.Get("/users", uh.SearchUsers)

			// Two-factor authentication management
			tfH := handler.NewTwoFactor(twoFactor)
			r.Get("/users/me/2fa/status", tfH.Status)
			r.With(rl.Limit("auth")).Post("/users/me/2fa/enroll/begin", tfH.EnrollBegin)
			r.With(rl.Limit("auth")).Post("/users/me/2fa/enroll/confirm", tfH.EnrollConfirm)
			r.With(rl.Limit("auth")).Post("/users/me/2fa/disable", tfH.Disable)
			r.With(rl.Limit("auth")).Post("/users/me/2fa/backup-codes/regenerate", tfH.RegenerateBackupCodes)

			// Social follows
			socialH := handler.NewSocial(social)
			r.With(rl.Limit("follow")).Post("/users/{id}/follow", socialH.Follow)
			r.With(rl.Limit("social_toggle")).Delete("/users/{id}/follow", socialH.Unfollow)
			r.With(rl.Limit("social_toggle")).Post("/users/me/unfollow-batch", socialH.BulkUnfollow)
			r.Get("/users/{id}/followers", socialH.ListFollowers)
			r.Get("/users/{id}/following", socialH.ListFollowing)
			r.Get("/users/me/follow-requests", socialH.ListFollowRequests)
			r.Post("/users/me/follow-requests/{id}/decide", socialH.DecideFollowRequest)

			// Block
			blockH := handler.NewBlock(blocks)
			r.With(rl.Limit("social_toggle")).Post("/users/{id}/block", blockH.Block)
			r.With(rl.Limit("social_toggle")).Delete("/users/{id}/block", blockH.Unblock)
			r.Get("/users/me/blocks", blockH.ListBlocked)

			// Mute (feed-only hide; keeps interaction intact unlike block)
			muteH := handler.NewMute(mutes)
			r.With(rl.Limit("social_toggle")).Post("/users/{id}/mute", muteH.Mute)
			r.With(rl.Limit("social_toggle")).Delete("/users/{id}/mute", muteH.Unmute)
			r.Get("/users/me/mutes", muteH.ListMuted)

			// Notifications
			notifH := handler.NewNotification(notifications)
			r.Get("/notifications", notifH.List)
			r.Get("/notifications/unread-count", notifH.UnreadCount)
			r.Post("/notifications/read", notifH.MarkRead)
			r.Get("/notifications/preferences", notifH.GetPreferences)
			r.Patch("/notifications/preferences", notifH.UpdatePreferences)

			// Push-notification device tokens
			deviceH := handler.NewDevice(devices)
			r.Post("/devices", deviceH.Register)
			r.Delete("/devices", deviceH.Unregister)

			// Moderation: user-submitted reports
			reportH := handler.NewReport(moderation)
			r.With(rl.Limit("report")).Post("/reports", reportH.Create)
			supportH := handler.NewSupportTicket(supportTickets)
			featureH := handler.NewFeatureRequest(featureRequests)
			r.With(rl.Limit("report")).Post("/tickets", supportH.Create)
			r.Get("/tickets", supportH.ListMine)
			r.Get("/tickets/unread-count", supportH.UnreadCount)
			r.Get("/tickets/{id}", supportH.Get)
			r.Patch("/tickets/{id}", supportH.Update)
			r.Delete("/tickets/{id}", supportH.Delete)
			r.Post("/tickets/{id}/messages", supportH.AddMessage)
			r.Post("/tickets/{id}/read", supportH.MarkRead)
			// backwards-compatible legacy routes
			r.With(rl.Limit("report")).Post("/support/tickets", supportH.Create)
			r.Get("/support/tickets", supportH.ListMine)
			r.Get("/support/tickets/unread-count", supportH.UnreadCount)
			r.Get("/support/tickets/{id}", supportH.Get)
			r.Patch("/support/tickets/{id}", supportH.Update)
			r.Delete("/support/tickets/{id}", supportH.Delete)
			r.Post("/support/tickets/{id}/messages", supportH.AddMessage)
			r.Post("/support/tickets/{id}/read", supportH.MarkRead)

			// Support queue for platform and scoped league/club admins.
			r.Get("/admin/tickets", supportH.AdminList)
			r.Get("/admin/tickets/{id}", supportH.AdminGet)
			r.Post("/admin/tickets/{id}/status", supportH.AdminTransitionStatus)
			r.Post("/admin/tickets/{id}/assign", supportH.AdminAssign)
			r.Delete("/admin/tickets/{id}", supportH.AdminDelete)
			r.Post("/admin/tickets/{id}/feature-request", featureH.AdminCreateFromTicket)
			r.Patch("/admin/feature-requests/{id}", featureH.AdminUpdate)
			r.Delete("/admin/feature-requests/{id}", featureH.AdminDelete)

			r.Get("/feature-requests", featureH.List)
			r.Get("/feature-requests/ranking", featureH.Rank)
			r.Get("/feature-requests/{id}", featureH.Get)
			r.Post("/feature-requests/{id}/vote", featureH.Vote)
			r.With(rl.Limit("comment")).Post("/feature-requests/{id}/comments", commentH.CreateOnFeatureRequest)
			r.Get("/feature-requests/{id}/comments", commentH.ListOnFeatureRequest)

			// League/club scoped moderation (admins of that community).
			r.Get("/leagues/{id}/reports", reportH.ListForLeague)
			r.Post("/leagues/{id}/reports/{reportId}/decide", reportH.DecideForLeague)
			r.Get("/clubs/{id}/reports", reportH.ListForClub)
			r.Post("/clubs/{id}/reports/{reportId}/decide", reportH.DecideForClub)

			// Score card comments (write operations — auth required)
			r.With(rl.Limit("comment")).Post("/score-cards/{id}/comments", commentH.Create)
			r.Patch("/score-cards/{id}/comments/{commentId}", commentH.Update)
			r.Delete("/score-cards/{id}/comments/{commentId}", commentH.Delete)

			// Generic comment operations (replies, edit/delete by comment ID)
			r.With(rl.Limit("comment")).Post("/comments/{id}/replies", commentH.Reply)
			r.Get("/comments/{id}/replies", commentH.ListReplies)
			r.Patch("/comments/{id}", commentH.Update)
			r.Delete("/comments/{id}", commentH.Delete)

			// League/club-scoped comment moderation — callable by the admins of
			// the league or club that owns the comment's target, or by global
			// admins. Flagged comments stay visible with a banner and clear
			// automatically when the author edits them.
			r.With(rl.Limit("report")).Post("/comments/{id}/flag", commentH.Flag)
			r.With(rl.Limit("report")).Post("/comments/{id}/unflag", commentH.Unflag)

			// Likes
			lkh := handler.NewLike(likes)
			r.With(rl.Limit("like")).Post("/score-cards/{id}/like", lkh.LikeScoreCard)
			r.With(rl.Limit("like")).Delete("/score-cards/{id}/like", lkh.UnlikeScoreCard)
			r.With(rl.Limit("like")).Post("/comments/{id}/like", lkh.LikeComment)
			r.With(rl.Limit("like")).Delete("/comments/{id}/like", lkh.UnlikeComment)
			r.With(rl.Limit("like")).Post("/posts/{id}/like", lkh.LikePost)
			r.With(rl.Limit("like")).Delete("/posts/{id}/like", lkh.UnlikePost)
			r.With(rl.Limit("like")).Post("/activities/{id}/like", lkh.LikeActivity)
			r.With(rl.Limit("like")).Delete("/activities/{id}/like", lkh.UnlikeActivity)
			r.With(rl.Limit("comment")).Post("/activities/{id}/comments", commentH.CreateOnActivity)
			r.Get("/activities/{id}/comments", commentH.ListOnActivity)

			// Posts
			postH := handler.NewPost(posts)
			r.With(rl.Limit("post")).Post("/posts", postH.Create)
			r.With(rl.Limit("post")).Post("/posts/share", postH.Share)
			r.Get("/posts/{id}", postH.Get)
			r.Patch("/posts/{id}", postH.Update)
			r.Delete("/posts/{id}", postH.Delete)
			r.With(rl.Limit("report")).Post("/posts/{id}/flag", postH.Flag)
			r.With(rl.Limit("report")).Post("/posts/{id}/unflag", postH.Unflag)
			r.With(rl.Limit("comment")).Post("/posts/{id}/comments", commentH.CreateOnPost)
			r.Get("/posts/{id}/comments", commentH.ListOnPost)

			// Activity feed
			activityH := handler.NewActivity(activity)
			r.Get("/feed", activityH.GetFeed)
			r.Delete("/activities/{id}", activityH.DeleteActivity)

			// Leagues (mutations — reads are public via OptionalAuthenticate below)
			lh := handler.NewLeague(leagues, images)
			r.Get("/users/me/leagues", lh.ListMyLeagues)
			r.Post("/leagues", lh.Create)
			r.Patch("/leagues/{id}", lh.Update)
			r.Post("/leagues/{id}/join", lh.Join)
			r.Post("/leagues/{id}/ensure-round", lh.EnsureDefaultRound)
			r.Post("/leagues/{id}/image", lh.UploadImage)
			r.Get("/leagues/{id}/posts", postH.ListByLeague)

			// League config & management
			r.Get("/leagues/{id}/config", lh.GetConfig)
			r.Patch("/leagues/{id}/config", lh.UpdateConfig)
			r.Delete("/leagues/{id}/members/me", lh.Leave)
			r.Delete("/leagues/{id}/members/{userId}", lh.RemoveMember)
			r.Patch("/leagues/{id}/members/{userId}", lh.UpdateMember)

			// Seasons & rounds
			r.Post("/leagues/{id}/seasons", lh.CreateSeason)
			r.Get("/leagues/{id}/seasons", lh.ListSeasons)
			r.Post("/leagues/{id}/seasons/{seasonId}/rounds", lh.CreateRound)
			r.Get("/leagues/{id}/seasons/{seasonId}/rounds", lh.ListRounds)

			// Join requests (admin)
			r.Get("/leagues/{id}/join-requests", lh.ListJoinRequests)
			r.Post("/leagues/{id}/join-requests/{requestId}/decide", lh.DecideJoinRequest)
			r.Post("/leagues/{id}/join-code", lh.RegenerateJoinCode)

			// Score verification
			r.Get("/score-cards/{id}/league", lh.GetLeagueForScoreCard)
			r.Post("/score-cards/{id}/confirmations", lh.ConfirmScore)
			r.Get("/score-cards/{id}/audit-trail", lh.GetScoreAuditTrail)
			r.Post("/score-cards/{id}/reopen", lh.ReopenScore)
			r.Post("/score-cards/{id}/amend", lh.AmendScore)
			r.Post("/score-cards/{id}/reject", lh.RejectScore)

			// Community review for personal practice cards
			crh := handler.NewCommunityReview(communityReview)
			r.Get("/score-cards/{id}/review-request", crh.Get)
			r.Post("/score-cards/{id}/review-request", crh.Request)
			r.Delete("/score-cards/{id}/review-request", crh.Cancel)
			r.Post("/score-cards/{id}/review-request/confirm", crh.Confirm)

			// Clubs (auth-required operations)
			clh := handler.NewClub(clubs, leagues, images)
			r.Get("/users/me/clubs", clh.ListMine)
			r.Post("/clubs", clh.Create)
			r.Patch("/clubs/{id}", clh.Update)
			r.Post("/clubs/{id}/join", clh.Join)
			r.Get("/clubs/{id}/members", clh.ListMembers)
			r.Delete("/clubs/{id}/members/me", clh.Leave)
			r.Delete("/clubs/{id}/members/{userId}", clh.RemoveMember)
			r.Patch("/clubs/{id}/members/{userId}", clh.UpdateMember)
			r.Post("/clubs/{id}/image", clh.UploadImage)
			r.Post("/clubs/{id}/leagues", clh.CreateLeague)
			r.Get("/clubs/{id}/leagues", clh.ListLeagues)
			r.Get("/clubs/{id}/posts", postH.ListByClub)

			// Club join requests (admin)
			r.Get("/clubs/{id}/join-requests", clh.ListJoinRequests)
			r.Post("/clubs/{id}/join-requests/{requestId}/decide", clh.DecideJoinRequest)
			r.Post("/clubs/{id}/join-code", clh.RegenerateJoinCode)

			// Achievements
			ah := handler.NewAchievement(achievements)
			r.Get("/users/me/achievements", ah.ListMine)
			r.Get("/users/{id}/achievements", ah.ListForUser)

			// Live Events (mutations + protected reads)
			eh := handler.NewEvent(events)
			r.Get("/users/me/events", eh.ListMine)
			r.Post("/events", eh.Create)
			r.Patch("/events/{slug}", eh.Update)
			r.Post("/events/{slug}/promote", eh.Promote)
			r.Post("/events/{slug}/participants", eh.Join)
			r.Post("/events/{slug}/guests", eh.AddGuest)
			r.Delete("/events/{slug}/participants/{participantId}", eh.RemoveParticipant)
			r.Post("/events/{slug}/scorers", eh.AddScorer)
			r.Post("/events/{slug}/scores", eh.RecordScores)
			r.Post("/events/{slug}/cards/{cardId}/confirm", eh.ConfirmCard)
			r.Post("/events/{slug}/cards/{cardId}/amend", eh.AmendCard)
			r.Post("/events/{slug}/cards/{cardId}/reject", eh.RejectCard)

			// Event invitations.
			eih := handler.NewEventInvitation(eventInvitations, events)
			r.Post("/events/{slug}/invitations", eih.CreateBatch)
			r.Get("/events/{slug}/invitations", eih.List)
			r.Get("/events/{slug}/potential-invitees", eih.PotentialInvitees)
			r.Get("/events/invitations/{token}", eih.Get)
			r.Post("/events/invitations/{token}/accept", eih.Accept)
			r.Post("/events/invitations/{token}/decline", eih.Decline)

			// Admin routes
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAdmin)

				// Email settings
				aeh := handler.NewAdminEmail(smtp, emailTemplates, emailSender)
				r.Get("/admin/email/settings", aeh.GetSettings)
				r.Patch("/admin/email/settings", aeh.PatchSettings)
				r.Post("/admin/email/settings/test", aeh.TestSettings)
				r.Get("/admin/email/templates", aeh.ListTemplates)
				r.Get("/admin/email/templates/{key}", aeh.GetTemplate)
				r.Patch("/admin/email/templates/{key}", aeh.PatchTemplate)
				r.Post("/admin/email/templates/{key}/preview", aeh.PreviewTemplate)

				// User management
				auh := handler.NewAdminUsers(users)
				r.Get("/admin/users", auh.List)
				r.Get("/admin/users/{id}", auh.Get)
				r.Patch("/admin/users/{id}/role", auh.UpdateRole)
				r.Delete("/admin/users/{id}", auh.Delete)

				// Moderation queue
				reportAdminH := handler.NewReport(moderation)
				r.Get("/admin/reports", reportAdminH.AdminList)
				r.Post("/admin/reports/{id}/decide", reportAdminH.AdminDecide)

				// Activity feed moderation: site admins can hide/unhide any
				// feed item. Hidden activities disappear from every feed
				// query; reports against activities ride the existing
				// AdminReportsQueue notification fanout.
				adminActivityH := handler.NewAdminActivity(activity)
				r.Delete("/admin/activities/{id}", adminActivityH.Hide)
				r.Post("/admin/activities/{id}/unhide", adminActivityH.Unhide)

				// League management
				alh := handler.NewAdminLeagues(leagues, simulation)
				r.Get("/admin/leagues", alh.List)
				r.Get("/admin/leagues/{id}", alh.Get)
				r.Patch("/admin/leagues/{id}", alh.Update)
				r.Delete("/admin/leagues/{id}", alh.Delete)
				r.Get("/admin/leagues/{id}/members", alh.ListMembers)
				r.Post("/admin/leagues/{id}/members", alh.AddMember)
				r.Delete("/admin/leagues/{id}/members/{userId}", alh.RemoveMember)

				// Club management
				ach := handler.NewAdminClubs(clubs)
				r.Get("/admin/clubs", ach.List)
				r.Get("/admin/clubs/{id}", ach.Get)
				r.Patch("/admin/clubs/{id}", ach.Update)
				r.Delete("/admin/clubs/{id}", ach.Delete)
				r.Get("/admin/clubs/{id}/members", ach.ListMembers)
				r.Delete("/admin/clubs/{id}/members/{userId}", ach.RemoveMember)

				// FAQs
				r.Get("/admin/faqs", faqH.AdminList)
				r.Patch("/admin/faqs/reorder-items", faqH.AdminReorderItems)
				r.Patch("/admin/faqs/reorder-sections", faqH.AdminReorderSections)
				r.Get("/admin/faqs/{id}", faqH.AdminGet)
				r.Post("/admin/faqs", faqH.AdminCreate)
				r.Patch("/admin/faqs/{id}", faqH.AdminUpdate)
				r.Delete("/admin/faqs/{id}", faqH.AdminDelete)

				// Backups
				abh := handler.NewAdminBackup(backups, backupRepo)
				r.Get("/admin/backup/settings", abh.GetSettings)
				r.Patch("/admin/backup/settings", abh.PatchSettings)
				r.Post("/admin/backup/settings/test-s3", abh.TestS3)
				r.Post("/admin/backup/run", abh.Run)
				r.Get("/admin/backup/runs", abh.ListRuns)
				r.Get("/admin/backup/runs/{id}/download", abh.DownloadRun)
				r.Delete("/admin/backup/runs/{id}", abh.DeleteRun)
				r.Post("/admin/backup/restore/{id}", abh.RestoreFromRun)
				r.Post("/admin/backup/restore/upload", abh.RestoreFromUpload)

				// Sitemap & SEO management
				asmh := handler.NewAdminSitemap(sitemap)
				r.Get("/admin/sitemap/stats", asmh.Stats)
				r.Get("/admin/sitemap/indexnow-key", asmh.KeyInfo)
				r.Post("/admin/sitemap/ping", asmh.Ping)
				r.Get("/admin/sitemap/submissions", asmh.ListSubmissions)

				// Categories master data (admin CRUD).
				cath := handler.NewCategory(categories)
				r.Get("/admin/categories", cath.AdminList)
				r.Post("/admin/categories", cath.AdminCreate)
				r.Patch("/admin/categories/{id}", cath.AdminUpdate)
				r.Delete("/admin/categories/{id}", cath.AdminDelete)

				// Live Events (admin list + delete).
				adminEH := handler.NewAdminEvents(events)
				r.Get("/admin/events", adminEH.List)
				r.Delete("/admin/events/{id}", adminEH.Delete)

				// Site-wide gear analytics.
				agh := handler.NewAdminGear(adminGear)
				r.Get("/admin/gear/stats", agh.Stats)
				r.Get("/admin/gear/models", agh.ListModels)
				r.Get("/admin/gear/model", agh.ModelDetail)

				// Activity simulation engine.
				asimh := handler.NewAdminSimulation(simulation, images)
				r.Get("/admin/simulation/settings", asimh.GetSettings)
				r.Patch("/admin/simulation/settings", asimh.PatchSettings)
				r.Get("/admin/simulation/status", asimh.GetStatus)
				r.Post("/admin/simulation/run-now", asimh.RunNow)
				r.Get("/admin/simulation/personas", asimh.ListPersonas)
				r.Patch("/admin/simulation/personas/{id}", asimh.PatchPersona)
				r.Post("/admin/simulation/personas/{id}/avatar", asimh.UploadPersonaAvatar)
				r.Delete("/admin/simulation/personas/{id}/avatar", asimh.DeletePersonaAvatar)
				r.Post("/admin/simulation/personas/{id}/join-league", asimh.JoinPersonaToLeague)
				r.Post("/admin/simulation/personas/{id}/join-club", asimh.JoinPersonaToClub)
				r.Delete("/admin/simulation/personas", asimh.PurgeAll)
				r.Delete("/admin/simulation/personas/{id}", asimh.DeletePersona)
				r.Post("/admin/simulation/cleanup", asimh.Cleanup)
				r.Get("/admin/simulation/audit", asimh.ListAudit)
			})
		})

		// Public league routes (no auth required)
		lh := handler.NewLeague(leagues, images)
		r.Get("/leagues", lh.List)

		// Public pellet leaderboard (no auth required)
		pth := handler.NewPelletTest(pelletTests, images)
		r.Get("/pellet-tests/public-leaderboard", pth.PublicLeaderboard)

		// Public achievement catalog (no auth required). Per-user earned lists
		// remain behind /users/{id}/achievements with privacy enforcement.
		achH := handler.NewAchievement(achievements)
		r.Get("/achievements", achH.ListDefs)

		// Public categories catalog used by event-create form.
		catH := handler.NewCategory(categories)
		r.Get("/categories", catH.ListPublic)

		// Public routes where viewer context is used for privacy enforcement.
		r.Group(func(r chi.Router) {
			r.Use(middleware.OptionalAuthenticate(auth))
			// Comment read: honors score card visibility and block state.
			r.Get("/score-cards/{id}/comments", commentH.List)

			// Score card and pellet test public reads. The service layer
			// returns 404 unless the card/session is public and the owner's
			// profile_visibility is not private; authed owners always see
			// their own row.
			publicSC := handler.NewScoreCard(scoreCards, images)
			r.Get("/score-cards/{id}", publicSC.Get)
			publicPT := handler.NewPelletTest(pelletTests, images)
			r.Get("/pellet-tests/{id}", publicPT.Get)

			clh := handler.NewClub(clubs, leagues, images)
			r.Get("/clubs", clh.List)
			r.Get("/clubs/{id}", clh.GetByID)
			r.Get("/clubs/{id}/summary", clh.Summary)
			r.Get("/clubs/{id}/standings", clh.GetStandings)

			// League reads mirror club semantics: the detail endpoint honors
			// private-league gating via the service layer; the summary endpoint
			// returns a minimal public-safe shape used to render the
			// "members-only" banner with a join CTA.
			publicLH := handler.NewLeague(leagues, images)
			r.Get("/leagues/{id}", publicLH.Get)
			r.Get("/leagues/{id}/summary", publicLH.Summary)
			r.Get("/leagues/{id}/standings", publicLH.Standings)
			r.Get("/leagues/{id}/scores", publicLH.ListScores)
			r.Get("/leagues/{id}/score-counts", publicLH.ScoreCounts)
			r.Get("/leagues/{id}/members", publicLH.ListMembers)

			// Public Live Event reads. Visibility is enforced server-side.
			publicEH := handler.NewEvent(events)
			r.Get("/events", publicEH.List)
			r.Get("/events/{slug}", publicEH.Get)
			r.Get("/events/{slug}/participants", publicEH.ListParticipants)
			r.Get("/events/{slug}/scoreboard", publicEH.Scoreboard)
			r.Get("/events/{slug}/scores", publicEH.ListScores)
			r.Get("/events/{slug}/cards", publicEH.ListEventCards)
			r.Get("/events/{slug}/results.csv", publicEH.ResultsCSV)

			// Public user profile. Service redacts private profiles via
			// `is_private:true` so UIs can show a "request to follow" state
			// instead of falling through to 404.
			uh := handler.NewUser(users, social, images)
			r.Get("/users/{id}", uh.GetProfile)
		})
	})

	return r
}

// securityHeadersMiddleware sets a baseline of HTTP security response headers
// on every response. HSTS is only emitted in production so local HTTP dev is
// not pinned to HTTPS.
func securityHeadersMiddleware(env string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Permissions-Policy", "geolocation=(self), microphone=(), camera=()")
			h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
			if env == "production" {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			// Required so browsers attach the httpOnly refresh cookie on
			// cross-origin /auth/refresh and /auth/logout calls. The Allow-
			// Origin header above is the configured CORS_ORIGIN, never `*`,
			// which is the precondition for credentialed requests.
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
