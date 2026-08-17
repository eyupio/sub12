package config

import (
	"errors"
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
	// `verify-ca`, or `verify-full` in production unless
	// DBAllowInsecureLocalNetwork says otherwise.
	DBSSLMode string `envconfig:"DB_SSLMODE" default:"disable"`
	// DBAllowInsecureLocalNetwork is the operator asserting that Postgres is not
	// reachable from outside this host, so an unencrypted connection cannot be
	// observed. It is the only way past the production TLS check in Validate(),
	// and it exists because the shipped docker-compose topology puts Postgres on
	// a private bridge with no published port, where TLS would be ceremony. Do
	// not set it for a managed database or anything across a real network.
	DBAllowInsecureLocalNetwork bool `envconfig:"DB_ALLOW_INSECURE_LOCAL_NETWORK" default:"false"`

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
	// production. See CLAUDE.md "Outgoing public URLs".
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
	// production. See CLAUDE.md "Outgoing public URLs".
	DefaultAvatarURL string `envconfig:"DEFAULT_AVATAR_URL" default:""`
	// IndexNow key used to authenticate URL submission requests.
	IndexNowKey string `envconfig:"INDEXNOW_KEY" default:""`
	// Public URL where the IndexNow key file can be fetched.
	IndexNowKeyLocation string `envconfig:"INDEXNOW_KEY_LOCATION" default:""`

	// Internal URL where the frontend container serves index.html. Used by
	// the share-meta handler to fetch the SPA shell so it can inject
	// per-page Open Graph / Twitter card tags.
	//
	// Defaulted to the service name the shipped docker-compose stack uses,
	// because there is no such thing as a working deployment where this is
	// unset: without it every shared link, and every page in StaticPages,
	// serves a holding page marked noindex. That failure is silent — nothing
	// errors, the links just stop working and the pages quietly leave the
	// search index — so the default has to be the right answer for the
	// topology we ship rather than a blank that has to be discovered.
	FrontendOrigin string `envconfig:"FRONTEND_ORIGIN" default:"http://frontend:8080"`

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

// minSecretLength is the shortest JWT_SECRET production will accept. A 32-byte
// secret is the floor at which HMAC-SHA256 offline brute force stops being the
// cheapest way in; scripts/install.sh generates considerably more.
const minSecretLength = 32

// minAdminPasswordLength applies to ADMIN_PASSWORD while SEED_ADMIN is on. The
// account it creates is a platform administrator, reachable from the public
// login form.
const minAdminPasswordLength = 12

// placeholderSecrets are the values shipped in .env.example, seed data and this
// project's documentation, plus the words people reach for when they mean "I'll
// fix this later". sub12's source is public, so the published ones are known to
// anyone who can read the repository — a deployment still carrying one is not
// "using a weak password", it is publishing its own credentials.
//
// Matched case-insensitively and as a substring, so `changeme123` and
// `CHANGEME-0000` are caught along with the bare value.
//
// Every entry has to be a phrase nobody would find in a secret they actually
// generated. Short generic words like `test` were deliberately removed: a real
// 64-character secret can contain one by chance, and a passphrase-style secret
// easily can, and rejecting it with "this is a published placeholder" would be
// both wrong and baffling. Prefer a false negative here over an error that
// misleads — the length check backs this up, and the installer generates
// something no human would have typed.
//
// Add to this list, rather than adding another check below, whenever a new
// placeholder appears in .env.example, docker-compose.yml or the dev seed.
var placeholderSecrets = []string{
	"changeme",
	"change-me",
	"password123",
	"placeholder",
	"replace-me",
	"replaceme",
	"insecure",
	"your-secret",
	"yoursecret",
	"my-secret",
	"mysecret",
	"supersecret",
	"super-secret",
	"todo",
	"xxxx",
}

// Validate enforces production-safe configuration. It returns nil outside
// production so local development stays frictionless — every check below exists
// because the value is safe on a laptop and dangerous on the internet.
//
// Every problem is reported at once rather than one per restart: an operator
// bringing up a new deployment should get the whole list in a single failure,
// not discover the next one each time they fix the last.
//
// Two families of check:
//
//   - Outgoing public URLs must not point at localhost. This is the guard rail
//     against emailing people `http://localhost:5173/reset-password`.
//   - Secrets must not be the placeholders published in this repository, and
//     must be long enough to be worth having. This one matters far more than it
//     looks: the JWT_SECRET in .env.example is public knowledge, and anyone who
//     knows it can mint a token for any user id with the admin role — no
//     password, no login, no rate limit in the way. That is a complete
//     authentication bypass on any deployment that copied the example file and
//     changed nothing.
func (c *Config) Validate() error {
	if !strings.EqualFold(c.Env, "production") {
		return nil
	}

	var problems []error
	fail := func(format string, args ...any) {
		problems = append(problems, fmt.Errorf(format, args...))
	}

	urls := []struct{ name, val string }{
		{"SITE_URL", c.SiteURL},
		{"PASSWORD_RESET_URL", c.PasswordResetURL},
		{"EVENT_INVITATION_URL", c.EventInvitationURL},
		{"DEFAULT_AVATAR_URL", c.DefaultAvatarURL},
	}
	for _, u := range urls {
		if isLoopback(u.val) {
			fail("config: %s must not contain localhost in production (got %q)", u.name, u.val)
		}
	}

	// JWT_SECRET signs every access token. A known value is an admin account.
	switch {
	case isPlaceholderSecret(c.JWTSecret):
		fail("config: JWT_SECRET is a placeholder published in this repository — " +
			"anyone can forge an admin token against it. Generate a real one: `openssl rand -base64 48`")
	case len(c.JWTSecret) < minSecretLength:
		fail("config: JWT_SECRET must be at least %d characters in production (got %d) — "+
			"generate one with `openssl rand -base64 48`", minSecretLength, len(c.JWTSecret))
	}

	if isPlaceholderSecret(c.DBPassword) {
		fail("config: DB_PASSWORD is a placeholder published in this repository — " +
			"set a real one: `openssl rand -base64 32`")
	}

	// libpq accepts an unencrypted connection under `disable`, `prefer` and
	// `allow` without complaint, so the password and every row cross the network
	// in the clear if anything is listening.
	//
	// This is the one check with an opt-out, because the stack we ship genuinely
	// does not need TLS: postgres:16-alpine serves no certificate unless you
	// mount one, and in docker-compose the database is on a private bridge
	// network with no published port, so nothing can be listening. Refusing to
	// boot there would mean the documented deployment fails out of the box and
	// every operator learns to reach for the override — which teaches them to
	// ignore it on the deployment where it matters.
	//
	// So: unencrypted is allowed, but only when the operator has said in writing
	// that the database is not reachable off-host. Anyone pointing sub12 at a
	// managed Postgres over the internet has to make that claim knowingly, and
	// it is grep-able in their config afterwards.
	switch strings.ToLower(c.DBSSLMode) {
	case "require", "verify-ca", "verify-full":
	case "disable", "prefer", "allow", "":
		if !c.DBAllowInsecureLocalNetwork {
			fail("config: DB_SSLMODE=%q sends the database password and every row over the "+
				"network unencrypted. Set DB_SSLMODE=require (or verify-ca / verify-full) for "+
				"any database reachable off this host. If Postgres is on a private network with "+
				"no published port — the topology docker-compose.yml ships — set "+
				"DB_ALLOW_INSECURE_LOCAL_NETWORK=true to confirm that deliberately.", c.sslMode())
		}
	default:
		fail("config: DB_SSLMODE=%q is not a libpq TLS mode (want disable, allow, prefer, "+
			"require, verify-ca or verify-full)", c.DBSSLMode)
	}

	// The refresh cookie is sent with credentials, so Allow-Origin can never be
	// `*` — browsers reject that combination, which would break refresh
	// silently rather than loudly.
	switch {
	case strings.TrimSpace(c.CORSOrigin) == "":
		fail("config: CORS_ORIGIN must name your own origin in production (e.g. https://sub12.io)")
	case strings.Contains(c.CORSOrigin, "*"):
		fail("config: CORS_ORIGIN must not contain a wildcard (got %q) — the refresh cookie is "+
			"sent with credentials, and browsers refuse a wildcard origin on a credentialed "+
			"request, so token refresh would fail for every user", c.CORSOrigin)
	case isLoopback(c.CORSOrigin):
		fail("config: CORS_ORIGIN must not point at localhost in production (got %q)", c.CORSOrigin)
	}

	// Only meaningful while seeding is on; an unset password with SEED_ADMIN off
	// is the normal steady state.
	if c.SeedAdmin {
		switch {
		case strings.TrimSpace(c.AdminPassword) == "":
			fail("config: SEED_ADMIN is on but ADMIN_PASSWORD is empty")
		case isPlaceholderSecret(c.AdminPassword):
			fail("config: ADMIN_PASSWORD is a placeholder published in this repository — " +
				"the seeded account is a platform administrator reachable from the public login form")
		case len(c.AdminPassword) < minAdminPasswordLength:
			fail("config: ADMIN_PASSWORD must be at least %d characters in production (got %d)",
				minAdminPasswordLength, len(c.AdminPassword))
		}
	}

	return errors.Join(problems...)
}

// isLoopback reports whether a URL points back at the machine serving it, which
// makes it useless in an email and a sign of a copied development config.
func isLoopback(val string) bool {
	lv := strings.ToLower(val)
	return strings.Contains(lv, "localhost") ||
		strings.Contains(lv, "127.0.0.1") ||
		strings.Contains(lv, "[::1]") ||
		strings.Contains(lv, "0.0.0.0")
}

// isPlaceholderSecret reports whether a secret is one of the values published in
// this repository, or contains one. Empty counts: envconfig marks JWT_SECRET and
// DB_PASSWORD required, so an empty value here means a caller built a Config
// directly, and "no secret" is not a production secret either.
func isPlaceholderSecret(secret string) bool {
	s := strings.ToLower(strings.TrimSpace(secret))
	if s == "" {
		return true
	}
	for _, placeholder := range placeholderSecrets {
		if strings.Contains(s, placeholder) {
			return true
		}
	}
	return false
}
