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
	images *repository.ImageRepository,
) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestLogger(log))
	r.Use(chimiddleware.Recoverer)
	r.Use(corsMiddleware(cfg.CORSOrigin))

	// Health probes (no auth)
	h := handler.NewHealth(db)
	r.Get("/healthz", h.Liveness)
	r.Get("/readyz", h.Readiness)

	// Versioned API
	r.Route("/api/v1", func(r chi.Router) {
		// Pre-instantiate comment handler so it can be used in both protected and public groups
		commentH := handler.NewComment(comments)
		// Public auth routes
		authHandler := handler.NewAuth(auth)
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Post("/auth/logout", authHandler.Logout)
		r.Post("/auth/forgot-password", authHandler.ForgotPassword)
		r.Post("/auth/reset-password", authHandler.ResetPassword)

		// Public image serving (no auth required)
		ih := handler.NewImage(images)
		r.Get("/images/{id}", ih.Serve)

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

			// Score cards
			sc := handler.NewScoreCard(scoreCards, images)
			r.Post("/score-cards", sc.Create)
			r.Get("/score-cards", sc.List)
			r.Get("/score-cards/{id}", sc.Get)
			r.Patch("/score-cards/{id}", sc.Update)
			r.Post("/score-cards/{id}/image", sc.UploadImage)

			// Rifles
			rh := handler.NewRifle(rifles, images)
			r.Post("/rifles", rh.Create)
			r.Get("/rifles", rh.List)
			r.Patch("/rifles/{id}", rh.Update)
			r.Delete("/rifles/{id}", rh.Delete)
			r.Post("/rifles/{id}/image", rh.UploadImage)

			// Pellets
			ph := handler.NewPellet(pellets, images)
			r.Post("/pellets", ph.Create)
			r.Get("/pellets", ph.List)
			r.Patch("/pellets/{id}", ph.Update)
			r.Delete("/pellets/{id}", ph.Delete)
			r.Post("/pellets/{id}/image", ph.UploadImage)

			// Pellet tests
			pth := handler.NewPelletTest(pelletTests, images)
			r.Get("/pellet-tests/leaderboard", pth.Leaderboard)
			r.Get("/pellet-tests/stats", pth.Stats)
			r.Get("/pellet-tests/compare", pth.Compare)
			r.Get("/pellet-tests/timeline", pth.Timeline)
			r.Get("/pellet-tests/confidence", pth.ConfidenceBadge)
			r.Get("/pellet-tests/batch-report", pth.BatchReport)
			r.Get("/pellet-tests/combo-analytics", pth.ComboAnalytics)
			r.Post("/pellet-tests", pth.Create)
			r.Get("/pellet-tests", pth.List)
			r.Get("/pellet-tests/{id}", pth.Get)
			r.Patch("/pellet-tests/{id}", pth.Update)
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
			r.Post("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/detections", pth.CreateDetections)
			r.Get("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/detections", pth.ListDetections)
			r.Post("/pellet-tests/{id}/images/{imageId}/measurements/{measurementId}/annotate", pth.UploadAnnotatedImage)
			r.Patch("/pellet-tests/{id}/detections/{detectionId}", pth.UpdateDetection)
			r.Delete("/pellet-tests/{id}/detections/{detectionId}", pth.DeleteDetection)

			// User profiles
			uh := handler.NewUser(users, social, images)
			r.Patch("/users/me", uh.UpdateMe)
			r.Post("/users/me/avatar", uh.UploadAvatar)
			r.Post("/users/me/email", uh.RequestEmailChange)
			r.Post("/users/me/email/confirm", uh.ConfirmEmailChange)
			r.Get("/users/{id}", uh.GetProfile)

			// Social follows
			socialH := handler.NewSocial(social)
			r.Post("/users/{id}/follow", socialH.Follow)
			r.Delete("/users/{id}/follow", socialH.Unfollow)
			r.Get("/users/{id}/followers", socialH.ListFollowers)
			r.Get("/users/{id}/following", socialH.ListFollowing)
			r.Get("/users/me/follow-requests", socialH.ListFollowRequests)
			r.Post("/users/me/follow-requests/{id}/decide", socialH.DecideFollowRequest)

			// Block
			blockH := handler.NewBlock(blocks)
			r.Post("/users/{id}/block", blockH.Block)
			r.Delete("/users/{id}/block", blockH.Unblock)
			r.Get("/users/me/blocks", blockH.ListBlocked)

			// Score card comments (write operations — auth required)
			r.Post("/score-cards/{id}/comments", commentH.Create)
			r.Patch("/score-cards/{id}/comments/{commentId}", commentH.Update)
			r.Delete("/score-cards/{id}/comments/{commentId}", commentH.Delete)

			// Generic comment operations (replies, edit/delete by comment ID)
			r.Post("/comments/{id}/replies", commentH.Reply)
			r.Get("/comments/{id}/replies", commentH.ListReplies)
			r.Patch("/comments/{id}", commentH.Update)
			r.Delete("/comments/{id}", commentH.Delete)

			// Likes
			lkh := handler.NewLike(likes)
			r.Post("/score-cards/{id}/like", lkh.LikeScoreCard)
			r.Delete("/score-cards/{id}/like", lkh.UnlikeScoreCard)
			r.Post("/comments/{id}/like", lkh.LikeComment)
			r.Delete("/comments/{id}/like", lkh.UnlikeComment)
			r.Post("/posts/{id}/like", lkh.LikePost)
			r.Delete("/posts/{id}/like", lkh.UnlikePost)

			// Posts
			postH := handler.NewPost(posts)
			r.Post("/posts", postH.Create)
			r.Post("/posts/share", postH.Share)
			r.Get("/posts/{id}", postH.Get)
			r.Patch("/posts/{id}", postH.Update)
			r.Delete("/posts/{id}", postH.Delete)
			r.Post("/posts/{id}/comments", commentH.CreateOnPost)
			r.Get("/posts/{id}/comments", commentH.ListOnPost)

			// Activity feed
			activityH := handler.NewActivity(activity)
			r.Get("/feed", activityH.GetFeed)

			// Leagues
			lh := handler.NewLeague(leagues, images)
			r.Get("/users/me/leagues", lh.ListMyLeagues)
			r.Post("/leagues", lh.Create)
			r.Get("/leagues/{id}", lh.Get)
			r.Post("/leagues/{id}/join", lh.Join)
			r.Get("/leagues/{id}/standings", lh.Standings)
			r.Get("/leagues/{id}/scores", lh.ListScores)
			r.Post("/leagues/{id}/ensure-round", lh.EnsureDefaultRound)
			r.Post("/leagues/{id}/image", lh.UploadImage)
			r.Get("/leagues/{id}/posts", postH.ListByLeague)

			// League config & management
			r.Get("/leagues/{id}/config", lh.GetConfig)
			r.Patch("/leagues/{id}/config", lh.UpdateConfig)
			r.Get("/leagues/{id}/members", lh.ListMembers)
			r.Delete("/leagues/{id}/members/{userId}", lh.RemoveMember)

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
			r.Post("/score-cards/{id}/amend", lh.AmendScore)
			r.Post("/score-cards/{id}/reject", lh.RejectScore)

			// Clubs (auth-required operations)
			clh := handler.NewClub(clubs, leagues, images)
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

			// Achievements
			ah := handler.NewAchievement(achievements)
			r.Get("/users/me/achievements", ah.ListMine)
			r.Get("/users/{id}/achievements", ah.ListForUser)

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

				// League management
				alh := handler.NewAdminLeagues(leagues)
				r.Get("/admin/leagues", alh.List)
				r.Get("/admin/leagues/{id}", alh.Get)
				r.Patch("/admin/leagues/{id}", alh.Update)
				r.Delete("/admin/leagues/{id}", alh.Delete)
				r.Get("/admin/leagues/{id}/members", alh.ListMembers)
				r.Delete("/admin/leagues/{id}/members/{userId}", alh.RemoveMember)

				// Club management
				ach := handler.NewAdminClubs(clubs)
				r.Get("/admin/clubs", ach.List)
				r.Get("/admin/clubs/{id}", ach.Get)
				r.Patch("/admin/clubs/{id}", ach.Update)
				r.Delete("/admin/clubs/{id}", ach.Delete)
				r.Get("/admin/clubs/{id}/members", ach.ListMembers)
				r.Delete("/admin/clubs/{id}/members/{userId}", ach.RemoveMember)
			})
		})

		// Public league routes (no auth required)
		lh := handler.NewLeague(leagues, images)
		r.Get("/leagues", lh.List)

		// Public pellet leaderboard (no auth required)
		pth := handler.NewPelletTest(pelletTests, images)
		r.Get("/pellet-tests/public-leaderboard", pth.PublicLeaderboard)

		// Public routes where viewer context is used for privacy enforcement.
		r.Group(func(r chi.Router) {
			r.Use(middleware.OptionalAuthenticate(auth))
			// Comment read: honors score card visibility and block state.
			r.Get("/score-cards/{id}/comments", commentH.List)
			clh := handler.NewClub(clubs, leagues, images)
			r.Get("/clubs", clh.List)
			r.Get("/clubs/{id}", clh.GetByID)
			r.Get("/clubs/{id}/standings", clh.GetStandings)
		})
	})

	return r
}

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
