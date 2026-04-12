package api

import (
	"encoding/json"
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
	leagues *service.LeagueService,
	pelletTests *service.PelletTestService,
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
		// Public auth routes
		authHandler := handler.NewAuth(auth)
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Post("/auth/logout", authHandler.Logout)

		// Public image serving (no auth required)
		ih := handler.NewImage(images)
		r.Get("/images/{id}", ih.Serve)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(auth))

			r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
				userID, ok := middleware.UserIDFromContext(r.Context())
				if !ok {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					w.Write([]byte(`{"error":"unauthorized"}`))
					return
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"user_id": userID})
			})

			// Images
			r.Post("/images", ih.Upload)

			// Stats
			sh := handler.NewStats(stats)
			r.Get("/users/me/stats", sh.GetMe)
			r.Get("/users/me/rifle-stats", sh.GetRifleStats)

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
			uh := handler.NewUser(users, images)
			r.Patch("/users/me", uh.UpdateMe)
			r.Post("/users/me/avatar", uh.UploadAvatar)
			r.Get("/users/{id}", uh.GetProfile)

			// Leagues
			lh := handler.NewLeague(leagues, images)
			r.Get("/users/me/leagues", lh.ListMyLeagues)
			r.Post("/leagues", lh.Create)
			r.Post("/leagues/{id}/join", lh.Join)
			r.Get("/leagues/{id}/standings", lh.Standings)
			r.Post("/leagues/{id}/image", lh.UploadImage)

			// League config & management
			r.Get("/leagues/{id}/config", lh.GetConfig)
			r.Patch("/leagues/{id}/config", lh.UpdateConfig)
			r.Get("/leagues/{id}/members", lh.ListMembers)

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
			r.Post("/score-cards/{id}/confirmations", lh.ConfirmScore)
			r.Get("/score-cards/{id}/audit-trail", lh.GetScoreAuditTrail)
			r.Post("/score-cards/{id}/amend", lh.AmendScore)
			r.Post("/score-cards/{id}/reject", lh.RejectScore)
		})

		// Public league routes (no auth required)
		lh := handler.NewLeague(leagues, images)
		r.Get("/leagues", lh.List)
		r.Get("/leagues/{id}", lh.Get)

		// Public pellet leaderboard (no auth required)
		pth := handler.NewPelletTest(pelletTests, images)
		r.Get("/pellet-tests/public-leaderboard", pth.PublicLeaderboard)
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
