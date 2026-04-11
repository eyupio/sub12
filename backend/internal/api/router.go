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

	// Serve uploaded files (public, no auth)
	uploadsDir := http.Dir(cfg.UploadDir)
	r.Handle("/uploads/*", http.StripPrefix("/uploads", http.FileServer(uploadsDir)))

	// Versioned API
	r.Route("/api/v1", func(r chi.Router) {
		// Public auth routes
		authHandler := handler.NewAuth(auth)
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Post("/auth/logout", authHandler.Logout)

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

			// Stats
			sh := handler.NewStats(stats)
			r.Get("/users/me/stats", sh.GetMe)

			// Score cards
			sc := handler.NewScoreCard(scoreCards, cfg.UploadDir)
			r.Post("/score-cards", sc.Create)
			r.Get("/score-cards", sc.List)
			r.Get("/score-cards/{id}", sc.Get)
			r.Post("/score-cards/{id}/image", sc.UploadImage)

			// Rifles
			rh := handler.NewRifle(rifles)
			r.Post("/rifles", rh.Create)
			r.Get("/rifles", rh.List)
			r.Patch("/rifles/{id}", rh.Update)
			r.Delete("/rifles/{id}", rh.Delete)

			// Pellets
			ph := handler.NewPellet(pellets)
			r.Post("/pellets", ph.Create)
			r.Get("/pellets", ph.List)
			r.Patch("/pellets/{id}", ph.Update)
			r.Delete("/pellets/{id}", ph.Delete)

			// User profiles
			uh := handler.NewUser(users)
			r.Patch("/users/me", uh.UpdateMe)
			r.Get("/users/{id}", uh.GetProfile)

			// Leagues
			lh := handler.NewLeague(leagues)
			r.Post("/leagues", lh.Create)
			r.Post("/leagues/{id}/join", lh.Join)
			r.Get("/leagues/{id}/standings", lh.Standings)
		})

		// Public league routes (no auth required)
		lh := handler.NewLeague(leagues)
		r.Get("/leagues", lh.List)
		r.Get("/leagues/{id}", lh.Get)
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
