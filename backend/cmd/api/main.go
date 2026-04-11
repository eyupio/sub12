package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	api "github.com/jnnngs/sub-12/backend/internal/api"
	"github.com/jnnngs/sub-12/backend/internal/config"
	"github.com/jnnngs/sub-12/backend/internal/db"
	"github.com/jnnngs/sub-12/backend/internal/db/seed"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

func main() {
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	// Ensure upload directories exist
	if err := os.MkdirAll(filepath.Join(cfg.UploadDir, "score-cards"), 0755); err != nil {
		log.Fatal().Err(err).Msg("create upload directory")
	}

	if cfg.Env == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DSN())
	if err != nil {
		log.Fatal().Err(err).Msg("connect to database")
	}
	defer pool.Close()
	log.Info().Msg("database connected")

	if err := db.Migrate(cfg.DatabaseURL()); err != nil {
		log.Fatal().Err(err).Msg("run migrations")
	}
	log.Info().Msg("migrations up to date")

	if cfg.SeedAdmin {
		if cfg.AdminPassword == "" {
			log.Fatal().Msg("ADMIN_PASSWORD must be set when SEED_ADMIN=true")
		}
		if err := seed.Admin(ctx, pool, cfg.AdminPassword); err != nil {
			log.Fatal().Err(err).Msg("seed admin user")
		}
		log.Info().Msg("admin user seeded")
	}

	rdb, err := db.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to redis")
	}
	defer rdb.Close()
	log.Info().Msg("redis connected")

	// Repositories & services
	userRepo := repository.NewUserRepository(pool)
	authSvc := service.NewAuthService(userRepo, rdb, cfg.JWTSecret, cfg.JWTExpiryHours)

	scoreCardRepo := repository.NewScoreCardRepository(pool)
	scoreCardSvc := service.NewScoreCardService(scoreCardRepo)

	statsRepo := repository.NewStatsRepository(pool)
	statsSvc := service.NewStatsService(statsRepo)

	rifleRepo := repository.NewRifleRepository(pool)
	rifleSvc := service.NewRifleService(rifleRepo)

	pelletRepo := repository.NewPelletRepository(pool)
	pelletSvc := service.NewPelletService(pelletRepo)

	userSvc := service.NewUserService(userRepo)

	leagueRepo := repository.NewLeagueRepository(pool)
	leagueSvc := service.NewLeagueService(leagueRepo)

	router := api.NewRouter(cfg, log.Logger, pool, authSvc, scoreCardSvc, statsSvc, rifleSvc, pelletSvc, userSvc, leagueSvc)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", srv.Addr).Str("env", cfg.Env).Msg("server starting")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	}
	log.Info().Msg("server stopped")
}
