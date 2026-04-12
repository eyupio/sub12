package config

import (
	"net/url"

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
