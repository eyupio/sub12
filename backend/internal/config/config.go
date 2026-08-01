package config

import (
	"fmt"
	"net/url"
	"strings"
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
	// DBSSLMode controls libpq TLS negotiation. Must be set to `require`,
	// `verify-ca`, or `verify-full` in production.
	DBSSLMode string `envconfig:"DB_SSLMODE" default:"disable"`

	// Redis
	RedisURL string `envconfig:"REDIS_URL" default:"redis://localhost:6379"`

	// Auth
	JWTSecret               string `envconfig:"JWT_SECRET" required:"true"`
	JWTExpiryHours          int    `envconfig:"JWT_EXPIRY_HOURS" default:"24"`
	PasswordResetTTLMinutes int    `envconfig:"PASSWORD_RESET_TTL_MINUTES" default:"60"`
	// PasswordResetURL is the public URL of the frontend reset-password page.
	// Leave empty to derive from SiteURL as {SiteURL}/reset-password. Any
	// link emitted in an outgoing email must come from this kind of
	// configurable URL — never hard-code or default to localhost in
	// production. See AGENTS.md "Outgoing public URLs".
	PasswordResetURL string `envconfig:"PASSWORD_RESET_URL" default:""`
	// EventInvitationURL is the base URL for event invitation accept pages.
	// The token is appended as /{token}, e.g.
	// https://sub12.io/events/invitations/<token>. Leave empty to derive
	// from SiteURL as {SiteURL}/events/invitations.
	EventInvitationURL string `envconfig:"EVENT_INVITATION_URL" default:""`

	// CORS
	CORSOrigin string `envconfig:"CORS_ORIGIN" default:"http://localhost:5173"`

	// Public site URL used for sitemap generation and SEO pings.
	SiteURL string `envconfig:"SITE_URL" default:"https://sub12.io"`
	// DefaultAvatarURL is the public URL of the default user avatar image.
	// Leave empty to derive from SiteURL as {SiteURL}/default-avatar.svg.
	// Any link emitted in an outgoing email must come from this kind of
	// configurable URL — never hard-code or default to localhost in
	// production. See AGENTS.md "Outgoing public URLs".
	DefaultAvatarURL string `envconfig:"DEFAULT_AVATAR_URL" default:""`
	// IndexNow key used to authenticate URL submission requests.
	IndexNowKey string `envconfig:"INDEXNOW_KEY" default:""`
	// Public URL where the IndexNow key file can be fetched.
	IndexNowKeyLocation string `envconfig:"INDEXNOW_KEY_LOCATION" default:""`

	// Internal URL where the frontend container serves index.html. Used by
	// the share-meta handler to fetch the SPA shell so it can inject
	// per-page Open Graph / Twitter card tags. Empty falls back to a
	// minimal embedded template (crawlers still get correct tags; humans
	// get a Loading… placeholder).
	FrontendOrigin string `envconfig:"FRONTEND_ORIGIN" default:""`

	// Seed
	SeedAdmin     bool   `envconfig:"SEED_ADMIN" default:"false"`
	AdminPassword string `envconfig:"ADMIN_PASSWORD"`

	// Rate limiting (per-user, per-minute). RATELIMIT_ENABLED defaults to true
	// in production; tests can set RATELIMIT_ENABLED=false.
	RateLimitEnabled            bool `envconfig:"RATELIMIT_ENABLED" default:"true"`
	RateLimitFollowPerMin       int  `envconfig:"RATELIMIT_FOLLOW_PER_MIN" default:"10"`
	RateLimitCommentPerMin      int  `envconfig:"RATELIMIT_COMMENT_PER_MIN" default:"20"`
	RateLimitPostPerMin         int  `envconfig:"RATELIMIT_POST_PER_MIN" default:"10"`
	RateLimitReportPerMin       int  `envconfig:"RATELIMIT_REPORT_PER_MIN" default:"5"`
	RateLimitLikePerMin         int  `envconfig:"RATELIMIT_LIKE_PER_MIN" default:"60"`
	RateLimitSocialTogglePerMin int  `envconfig:"RATELIMIT_SOCIAL_TOGGLE_PER_MIN" default:"30"`
	// Auth bucket applies to password-bearing endpoints (login, register,
	// forgot/reset password). Keyed by client IP rather than user ID since
	// the request is unauthenticated.
	RateLimitAuthPerMin int `envconfig:"RATELIMIT_AUTH_PER_MIN" default:"10"`
	// Reverse geocoding is one lookup per location pick, but a user panning a
	// map picker can fire several in a row.
	RateLimitGeocodePerMin int `envconfig:"RATELIMIT_GEOCODE_PER_MIN" default:"30"`

	// Moderation flag grace window. When a comment or post is flagged by an
	// admin, the author gets this long to amend (edit) before the sweeper
	// promotes the row to hidden_at.
	ModerationFlagGrace time.Duration `envconfig:"MODERATION_FLAG_GRACE" default:"48h"`
	// Interval at which the moderation sweeper runs.
	ModerationSweepInterval time.Duration `envconfig:"MODERATION_SWEEP_INTERVAL" default:"15m"`

	// Reverse geocoding. GeocodeURL is the base URL of a Nominatim-compatible
	// endpoint used to turn picked coordinates into a place name; empty
	// disables the lookup and the UI falls back to showing coordinates.
	// GeocodeUserAgent identifies us to that endpoint (Nominatim's usage
	// policy requires it) — leave empty to derive it from SiteURL.
	GeocodeURL       string `envconfig:"GEOCODE_URL" default:"https://nominatim.openstreetmap.org"`
	GeocodeUserAgent string `envconfig:"GEOCODE_USER_AGENT" default:""`

	// Push notifications (Firebase Cloud Messaging, HTTP v1). FCMCredentialsJSON
	// is the full service-account JSON (with client_email + private_key); the
	// project id is read from it. Leave empty to disable push delivery — device
	// tokens are still stored and the no-op sender is used.
	FCMCredentialsJSON string `envconfig:"FCM_CREDENTIALS_JSON" default:""`
}

// DSN returns the PostgreSQL key=value connection string (for pgxpool).
func (c *Config) DSN() string {
	return "host=" + c.DBHost +
		" port=" + c.DBPort +
		" dbname=" + c.DBName +
		" user=" + c.DBUser +
		" password=" + c.DBPassword +
		" sslmode=" + c.sslMode()
}

// DatabaseURL returns a pgx5:// URL (for golang-migrate).
func (c *Config) DatabaseURL() string {
	u := url.URL{
		Scheme:   "pgx5",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     c.DBHost + ":" + c.DBPort,
		Path:     c.DBName,
		RawQuery: "sslmode=" + c.sslMode(),
	}
	return u.String()
}

func (c *Config) sslMode() string {
	if c.DBSSLMode == "" {
		return "disable"
	}
	return c.DBSSLMode
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}
	cfg.applyDerivedDefaults()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// applyDerivedDefaults fills public URL fields from SiteURL when not
// explicitly set. Keeps SITE_URL as the single source of truth so a new
// "send a link in an email" feature inherits the correct host without
// extra env wiring.
func (c *Config) applyDerivedDefaults() {
	base := strings.TrimRight(c.SiteURL, "/")
	if c.PasswordResetURL == "" && base != "" {
		c.PasswordResetURL = base + "/reset-password"
	}
	if c.EventInvitationURL == "" && base != "" {
		c.EventInvitationURL = base + "/events/invitations"
	}
	if c.DefaultAvatarURL == "" && base != "" {
		c.DefaultAvatarURL = base + "/default-avatar.svg"
	}
	if c.GeocodeUserAgent == "" {
		if base != "" {
			c.GeocodeUserAgent = "sub12 (+" + base + ")"
		} else {
			c.GeocodeUserAgent = "sub12"
		}
	}
}

// Validate enforces production-safe values for outgoing public URLs.
// In production, refuses to start if any user-facing URL still points at
// localhost — this is the guard rail against shipping emails that contain
// `http://localhost:5173/...` links.
func (c *Config) Validate() error {
	if !strings.EqualFold(c.Env, "production") {
		return nil
	}
	checks := map[string]string{
		"SITE_URL":             c.SiteURL,
		"PASSWORD_RESET_URL":   c.PasswordResetURL,
		"EVENT_INVITATION_URL": c.EventInvitationURL,
		"DEFAULT_AVATAR_URL":   c.DefaultAvatarURL,
	}
	for name, val := range checks {
		lv := strings.ToLower(val)
		if strings.Contains(lv, "localhost") || strings.Contains(lv, "127.0.0.1") {
			return fmt.Errorf("config: %s must not contain localhost in production (got %q)", name, val)
		}
	}
	return nil
}
