package api

import (
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
func NewRouter(cfg *config.Config, log zerolog.Logger, db handler.Pinger, auth *service.AuthService, scoreCards *service.ScoreCardService) http.Handler {
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

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(auth))

			r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
				userID, _ := middleware.UserIDFromContext(r.Context())
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"user_id":"` + userID + `"}`))
			})

			// Score cards
			sc := handler.NewScoreCard(scoreCards)
			r.Post("/score-cards", sc.Create)
			r.Get("/score-cards", sc.List)
			r.Get("/score-cards/{id}", sc.Get)
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
