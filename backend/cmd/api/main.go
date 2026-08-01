package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	api "github.com/jnnngs/sub-12/backend/internal/api"
	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/config"
	"github.com/jnnngs/sub-12/backend/internal/db"
	"github.com/jnnngs/sub-12/backend/internal/db/seed"
	"github.com/jnnngs/sub-12/backend/internal/email"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

func main() {
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
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
	passwordResetTokenRepo := repository.NewPasswordResetTokenRepository(pool)

	scoreCardRepo := repository.NewScoreCardRepository(pool)

	activityRepo := repository.NewActivityRepository(pool)

	leagueRepo := repository.NewLeagueRepository(pool)
	clubRepo := repository.NewClubRepository(pool)

	achievementRepo := repository.NewAchievementRepository(pool)

	activitySvc := service.NewActivityService(activityRepo, log.Logger, leagueRepo, clubRepo, achievementRepo)
	blockRepo := repository.NewBlockRepository(pool)

	postRepo := repository.NewPostRepository(pool)

	commentRepo := repository.NewCommentRepository(pool)

	socialRepo := repository.NewSocialRepository(pool)
	pelletTestRepo := repository.NewPelletTestRepository(pool)
	likeRepo := repository.NewLikeRepository(pool)

	communityReviewRepo := repository.NewCommunityReviewRepository(pool)

	// AchievementService is constructed up front with all count-repo
	// dependencies. Services that trigger achievement evaluation (social,
	// comment, club, pellet testing, score card) receive this instance.
	achievementSvc := service.NewAchievementService(
		achievementRepo,
		scoreCardRepo,
		socialRepo,
		commentRepo,
		clubRepo,
		pelletTestRepo,
		likeRepo,
		communityReviewRepo,
		userRepo,
		activitySvc,
	)

	scoreCardSvc := service.NewScoreCardService(scoreCardRepo, leagueRepo, activitySvc, achievementSvc)
	scoreCardSvc.SetUserReader(userRepo)
	scoreCardSvc.SetLogger(log.Logger)

	statsRepo := repository.NewStatsRepository(pool)
	statsSvc := service.NewStatsService(statsRepo)

	rifleRepo := repository.NewRifleRepository(pool)
	rifleSvc := service.NewRifleService(rifleRepo)

	pelletRepo := repository.NewPelletRepository(pool)
	pelletSvc := service.NewPelletService(pelletRepo)

	locationRepo := repository.NewLocationRepository(pool)
	locationSvc := service.NewLocationService(locationRepo)
	geocodeSvc := service.NewGeocodeService(cfg.GeocodeURL, cfg.GeocodeUserAgent, rdb, log.Logger)

	leagueSvc := service.NewLeagueService(leagueRepo, clubRepo, activitySvc)

	pelletTestSvc := service.NewPelletTestService(pelletTestRepo, activitySvc, achievementSvc)
	pelletTestSvc.SetUserReader(userRepo)

	smtpRepo := repository.NewSMTPRepository(pool)
	smtpSvc := service.NewSMTPService(smtpRepo)

	emailTemplateRepo := repository.NewEmailTemplateRepository(pool)
	emailRenderer := email.NewRenderer()
	emailTemplateSvc := service.NewEmailTemplateService(emailTemplateRepo, emailRenderer)
	emailSenderSvc := service.NewEmailSenderService(smtpRepo, emailTemplateRepo, emailRenderer, log.Logger)

	emailChangeTokenRepo := repository.NewEmailChangeTokenRepository(pool)
	userSvc := service.NewUserService(userRepo, emailChangeTokenRepo, emailSenderSvc, log.Logger, cfg.CORSOrigin)

	authSvc := service.NewAuthService(
		userRepo,
		passwordResetTokenRepo,
		rdb,
		emailSenderSvc,
		log.Logger,
		cfg.JWTSecret,
		cfg.JWTExpiryHours,
		cfg.PasswordResetTTLMinutes,
		cfg.PasswordResetURL,
	)
	userSvc.SetSessionInvalidator(authSvc)

	twoFactorRepo := repository.NewTwoFactorRepository(pool)
	twoFactorSvc := service.NewTwoFactorService(userRepo, twoFactorRepo, rdb, log.Logger, "SUB12")
	authSvc.SetTwoFactor(twoFactorSvc)

	imageRepo := repository.NewImageRepository(pool)

	socialSvc := service.NewSocialService(socialRepo, blockRepo)
	blockSvc := service.NewBlockService(blockRepo, socialRepo)

	// Wire social into achievement service for profile-visibility enforcement on
	// GET /users/{id}/achievements. Done post-construction to avoid a cycle.
	achievementSvc.SetSocial(socialSvc)
	// Reverse wiring so successful follows can trigger achievement evaluation.
	// Post-construction to avoid the AchievementService ↔ SocialService cycle.
	socialSvc.SetAchievements(achievementSvc)

	clubSvc := service.NewClubService(clubRepo, activitySvc, achievementSvc)
	postSvc := service.NewPostService(postRepo, leagueRepo, clubRepo, socialRepo, activitySvc)

	featureRequestRepo := repository.NewFeatureRequestRepository(pool)

	commentSvc := service.NewCommentService(commentRepo, scoreCardSvc, postRepo, postSvc, blockRepo, leagueRepo, clubRepo, featureRequestRepo, activityRepo, achievementSvc)

	likeSvc := service.NewLikeService(likeRepo, scoreCardRepo, postSvc, blockRepo, activityRepo)
	// Wire achievements into likes so that liking content can trigger award checks.
	likeSvc.SetAchievements(achievementSvc)

	muteRepo := repository.NewMuteRepository(pool)
	notificationRepo := repository.NewNotificationRepository(pool)
	notificationSvc := service.NewNotificationService(notificationRepo, blockRepo, muteRepo, userRepo, emailSenderSvc, log.Logger)

	// Push notifications: device-token registry + transport. When FCM credentials
	// are configured the FCM HTTP v1 sender is used; otherwise a no-op sender
	// stores tokens without delivering. Registration and fan-out are wired either
	// way.
	deviceRepo := repository.NewDeviceRepository(pool)
	deviceSvc := service.NewDeviceService(deviceRepo)
	var pushSender service.PushSender = service.NewNoopPushSender(log.Logger)
	if cfg.FCMCredentialsJSON != "" {
		if s, err := service.NewFCMSender(cfg.FCMCredentialsJSON, log.Logger); err != nil {
			log.Warn().Err(err).Msg("invalid FCM credentials; push delivery disabled")
		} else {
			pushSender = s
			log.Info().Msg("FCM push sender enabled")
		}
	}
	notificationSvc.SetPush(deviceRepo, pushSender)

	reportRepo := repository.NewReportRepository(pool)
	moderationSvc := service.NewModerationService(
		reportRepo, postRepo, commentRepo, activityRepo, leagueRepo, clubRepo, userRepo,
		notificationSvc, emailSenderSvc, cfg.CORSOrigin, log.Logger,
	)
	supportTicketRepo := repository.NewSupportTicketRepository(pool)
	supportTicketSvc := service.NewSupportTicketService(supportTicketRepo, leagueRepo, clubRepo, userRepo, notificationSvc, emailSenderSvc, cfg.CORSOrigin)
	featureRequestSvc := service.NewFeatureRequestService(featureRequestRepo, supportTicketRepo, leagueRepo, clubRepo, userRepo, notificationSvc, activitySvc)

	faqRepo := repository.NewFAQRepository(pool)
	faqSvc := service.NewFAQService(faqRepo)

	sitemapRepo := repository.NewSitemapRepository(pool)
	sitemapSvc := service.NewSitemapService(sitemapRepo, cfg.SiteURL, cfg.IndexNowKey, cfg.IndexNowKeyLocation, log.Logger)

	// Wire notifications into services that fan out events. Done after
	// construction to avoid cycles.
	socialSvc.SetNotifications(notificationSvc)
	postSvc.SetNotifications(notificationSvc)
	clubSvc.SetNotifications(notificationSvc)
	leagueSvc.SetNotifications(notificationSvc)

	// Wire the export aggregators into UserService so GDPR data-export
	// can include score cards, posts, clubs and leagues without forcing
	// those repos through every UserService constructor.
	userSvc.SetExportRepos(scoreCardRepo, postRepo, clubRepo, leagueRepo)

	rl := middleware.NewRateLimiter(middleware.RateLimitConfig{
		Enabled:            cfg.RateLimitEnabled,
		FollowPerMin:       cfg.RateLimitFollowPerMin,
		CommentPerMin:      cfg.RateLimitCommentPerMin,
		PostPerMin:         cfg.RateLimitPostPerMin,
		ReportPerMin:       cfg.RateLimitReportPerMin,
		LikePerMin:         cfg.RateLimitLikePerMin,
		SocialTogglePerMin: cfg.RateLimitSocialTogglePerMin,
		GeocodePerMin:      cfg.RateLimitGeocodePerMin,
		AuthPerMin:         cfg.RateLimitAuthPerMin,
	}, rdb)

	// Moderation flag sweeper — promotes un-amended flagged rows to hidden_at
	// after the grace window. Runs as a background goroutine.
	moderationSweeper := service.NewModerationSweeper(pool, log.Logger, cfg.ModerationFlagGrace, cfg.ModerationSweepInterval)
	go moderationSweeper.Run(ctx)

	communityReviewSvc := service.NewCommunityReviewService(communityReviewRepo, scoreCardRepo, leagueRepo, activitySvc, achievementSvc)
	communityReviewSvc.SetNotifications(notificationSvc)
	communityReviewSvc.SetLogger(log.Logger)

	// Live Events
	categoryRepo := repository.NewCategoryRepository(pool)
	categorySvc := service.NewCategoryService(categoryRepo)
	eventRepo := repository.NewEventRepository(pool)
	eventSvc := service.NewEventService(eventRepo, clubRepo, categoryRepo, activitySvc, achievementSvc)
	achievementSvc.SetEventCounts(eventRepo)
	eventSvc.SetCardVerificationDeps(leagueRepo, scoreCardRepo)
	scoreCardSvc.SetEventService(eventSvc)

	eventInvitationRepo := repository.NewEventInvitationRepository(pool)
	eventInvitationSvc := service.NewEventInvitationService(eventInvitationRepo, eventRepo, userRepo, clubRepo, emailSenderSvc, cfg.EventInvitationURL, log.Logger)

	// Daily archive sweep for completed events whose 30-day window has elapsed.
	go runEventArchiveSweep(ctx, eventSvc)

	backupRepo := repository.NewBackupRepository(pool)
	backupSvc := service.NewBackupService(backupRepo, service.BackupConfig{
		DBHost:     cfg.DBHost,
		DBPort:     cfg.DBPort,
		DBName:     cfg.DBName,
		DBUser:     cfg.DBUser,
		DBPassword: cfg.DBPassword,
		DBSSLMode:  cfg.DBSSLMode,
	}, log.Logger)
	backupScheduler := service.NewBackupScheduler(backupRepo, backupSvc, log.Logger)
	go backupScheduler.Run(ctx)

	// Activity simulation engine — admin-controlled. Provisions flagged
	// simulated accounts and has them post/like/comment/follow/share through the
	// normal service paths. Paced by a background runner; disabled by default.
	simulationRepo := repository.NewSimulationRepository(pool)
	simulationSvc := service.NewSimulationService(simulationRepo, scoreCardSvc, likeSvc, commentSvc, socialSvc, rifleSvc, pelletSvc, postSvc, leagueSvc, clubSvc, log.Logger)
	// Wire the simulation public-content toggle into the feed and public pellet
	// leaderboard so simulated content can be excluded when the admin disables it.
	activitySvc.SetSimulatedContentFilter(simulationSvc)
	pelletTestSvc.SetSimulatedContentFilter(simulationSvc)

	gearShowcaseSvc := service.NewGearShowcaseService(
		repository.NewGearShowcaseRepository(pool), rifleRepo, pelletRepo, simulationSvc)
	adminGearSvc := service.NewAdminGearService(repository.NewAdminGearRepository(pool))
	go service.NewSimulationRunner(simulationSvc, log.Logger).Run(ctx)

	router := api.NewRouter(cfg, log.Logger, pool, authSvc, scoreCardSvc, statsSvc, rifleSvc, pelletSvc, userSvc, socialSvc, leagueSvc, pelletTestSvc, commentSvc, activitySvc, achievementSvc, smtpSvc, emailTemplateSvc, emailSenderSvc, clubSvc, blockSvc, likeSvc, postSvc, notificationSvc, deviceSvc, moderationSvc, supportTicketSvc, featureRequestSvc, faqSvc, sitemapSvc, muteRepo, rl, imageRepo, twoFactorSvc, communityReviewSvc, locationSvc, backupSvc, backupRepo, categorySvc, eventSvc, eventInvitationSvc, simulationSvc, gearShowcaseSvc, adminGearSvc, geocodeSvc)

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

// runEventArchiveSweep flips completed events past their 30-day window into
// the archived state once a day. Logs the count for visibility; failures are
// non-fatal and retried on the next tick.
func runEventArchiveSweep(ctx context.Context, eventSvc *service.EventService) {
	tick := time.NewTicker(24 * time.Hour)
	defer tick.Stop()
	// First run shortly after start so a stale deployment catches up.
	first := time.NewTimer(2 * time.Minute)
	defer first.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-first.C:
			n, err := eventSvc.RunArchiveSweep(ctx)
			if err != nil {
				log.Warn().Err(err).Msg("event archive sweep failed")
			} else if n > 0 {
				log.Info().Int("archived", n).Msg("event archive sweep")
			}
		case <-tick.C:
			n, err := eventSvc.RunArchiveSweep(ctx)
			if err != nil {
				log.Warn().Err(err).Msg("event archive sweep failed")
			} else if n > 0 {
				log.Info().Int("archived", n).Msg("event archive sweep")
			}
		}
	}
}
