package config

import (
	"net/url"
	"time"

	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration read from environment variables.
type Config struct {
	// Server
	Port string `envconfig:"PORT" default:"8080"`
	Env  string `envconfig:"ENV" default:"development"`

	// Database
	DBHost     string `envconfig:"DB_HOST" default:"localhost"`
	DBPort     string `envconfig:"DB_PORT" default:"5432"`
	DBName     string `envconfig:"DB_NAME" default:"sub12"`
	DBUser     string `envconfig:"DB_USER" default:"sub12"`
	DBPassword string `envconfig:"DB_PASSWORD" required:"true"`

	// Redis
	RedisURL string `envconfig:"REDIS_URL" default:"redis://localhost:6379"`

	// Auth
	JWTSecret               string `envconfig:"JWT_SECRET" required:"true"`
	JWTExpiryHours          int    `envconfig:"JWT_EXPIRY_HOURS" default:"24"`
	PasswordResetTTLMinutes int    `envconfig:"PASSWORD_RESET_TTL_MINUTES" default:"60"`
	PasswordResetURL        string `envconfig:"PASSWORD_RESET_URL" default:"http://localhost:5173/reset-password"`

	// CORS
	CORSOrigin string `envconfig:"CORS_ORIGIN" default:"http://localhost:5173"`

	// Seed
	SeedAdmin     bool   `envconfig:"SEED_ADMIN" default:"false"`
	AdminPassword string `envconfig:"ADMIN_PASSWORD"`

	// Rate limiting (per-user, per-minute). RATELIMIT_ENABLED defaults to true
	// in production; tests can set RATELIMIT_ENABLED=false.
	RateLimitEnabled             bool `envconfig:"RATELIMIT_ENABLED" default:"true"`
	RateLimitFollowPerMin        int  `envconfig:"RATELIMIT_FOLLOW_PER_MIN" default:"10"`
	RateLimitCommentPerMin       int  `envconfig:"RATELIMIT_COMMENT_PER_MIN" default:"20"`
	RateLimitPostPerMin          int  `envconfig:"RATELIMIT_POST_PER_MIN" default:"10"`
	RateLimitReportPerMin        int  `envconfig:"RATELIMIT_REPORT_PER_MIN" default:"5"`
	RateLimitLikePerMin          int  `envconfig:"RATELIMIT_LIKE_PER_MIN" default:"60"`
	RateLimitSocialTogglePerMin  int  `envconfig:"RATELIMIT_SOCIAL_TOGGLE_PER_MIN" default:"30"`

	// Moderation flag grace window. When a comment or post is flagged by an
	// admin, the author gets this long to amend (edit) before the sweeper
	// promotes the row to hidden_at.
	ModerationFlagGrace time.Duration `envconfig:"MODERATION_FLAG_GRACE" default:"48h"`
	// Interval at which the moderation sweeper runs.
	ModerationSweepInterval time.Duration `envconfig:"MODERATION_SWEEP_INTERVAL" default:"15m"`
}

// DSN returns the PostgreSQL key=value connection string (for pgxpool).
func (c *Config) DSN() string {
	return "host=" + c.DBHost +
		" port=" + c.DBPort +
		" dbname=" + c.DBName +
		" user=" + c.DBUser +
		" password=" + c.DBPassword +
		" sslmode=disable"
}

// DatabaseURL returns a pgx5:// URL (for golang-migrate).
func (c *Config) DatabaseURL() string {
	u := url.URL{
		Scheme:   "pgx5",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     c.DBHost + ":" + c.DBPort,
		Path:     c.DBName,
		RawQuery: "sslmode=disable",
	}
	return u.String()
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
