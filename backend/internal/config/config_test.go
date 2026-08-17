package config

import (
	"strings"
	"testing"
)

func TestApplyDerivedDefaultsFromSiteURL(t *testing.T) {
	c := &Config{SiteURL: "https://sub12.io"}
	c.applyDerivedDefaults()
	if c.PasswordResetURL != "https://sub12.io/reset-password" {
		t.Errorf("PasswordResetURL = %q, want derived from SiteURL", c.PasswordResetURL)
	}
	if c.EventInvitationURL != "https://sub12.io/events/invitations" {
		t.Errorf("EventInvitationURL = %q, want derived from SiteURL", c.EventInvitationURL)
	}
	if c.DefaultAvatarURL != "https://sub12.io/default-avatar.svg" {
		t.Errorf("DefaultAvatarURL = %q, want derived from SiteURL", c.DefaultAvatarURL)
	}
}

func TestApplyDerivedDefaultsRespectsExplicitValues(t *testing.T) {
	c := &Config{
		SiteURL:            "https://sub12.io",
		PasswordResetURL:   "https://custom.example/reset",
		EventInvitationURL: "https://custom.example/invites",
	}
	c.applyDerivedDefaults()
	if c.PasswordResetURL != "https://custom.example/reset" {
		t.Errorf("explicit PasswordResetURL was overwritten: %q", c.PasswordResetURL)
	}
	if c.EventInvitationURL != "https://custom.example/invites" {
		t.Errorf("explicit EventInvitationURL was overwritten: %q", c.EventInvitationURL)
	}
}

func TestApplyDerivedDefaultsTrimsTrailingSlash(t *testing.T) {
	c := &Config{SiteURL: "https://sub12.io/"}
	c.applyDerivedDefaults()
	if c.EventInvitationURL != "https://sub12.io/events/invitations" {
		t.Errorf("EventInvitationURL = %q, want no double slash", c.EventInvitationURL)
	}
}

// productionConfig is a deployment that should boot: real public URLs, a real
// secret, TLS to the database, its own CORS origin. Each test below takes this
// and breaks exactly one thing, so a failure names the check that regressed
// rather than "production config is invalid".
func productionConfig() Config {
	return Config{
		Env:                "production",
		SiteURL:            "https://sub12.io",
		PasswordResetURL:   "https://sub12.io/reset-password",
		EventInvitationURL: "https://sub12.io/events/invitations",
		DefaultAvatarURL:   "https://sub12.io/default-avatar.svg",
		JWTSecret:          "wTq8kZ4vN2mJ7pR1yB6xH3sL9dF5gC0aQeUiOoPzXcVbNmAsDfGh",
		DBPassword:         "K4nR7wQ2zXpL9vB6mT1yH8sJ3dG5fC0a",
		DBSSLMode:          "require",
		CORSOrigin:         "https://sub12.io",
	}
}

func TestValidateProductionAcceptsAGoodConfig(t *testing.T) {
	cfg := productionConfig()
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateProductionRejectsLocalhost(t *testing.T) {
	cases := []struct {
		name  string
		apply func(*Config)
	}{
		{"site url", func(c *Config) { c.SiteURL = "http://localhost:5173" }},
		{"reset url", func(c *Config) { c.PasswordResetURL = "http://localhost:5173/reset" }},
		{"invitation url", func(c *Config) { c.EventInvitationURL = "http://localhost:5173/events/invitations" }},
		{"127.0.0.1", func(c *Config) { c.DefaultAvatarURL = "http://127.0.0.1/avatar.svg" }},
		{"ipv6 loopback", func(c *Config) { c.SiteURL = "http://[::1]:5173" }},
		{"wildcard bind address", func(c *Config) { c.SiteURL = "http://0.0.0.0:8080" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := productionConfig()
			tc.apply(&cfg)
			err := cfg.Validate()
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), "localhost") {
				t.Errorf("error message %q should mention localhost", err.Error())
			}
		})
	}
}

// The single most important check in this file. sub12's source is public, so the
// JWT_SECRET in .env.example is public: a deployment that kept it lets anyone
// mint a token for any user id with the admin role, bypassing the login form,
// the password hash and the rate limiter entirely.
func TestValidateProductionRejectsPublishedJWTSecret(t *testing.T) {
	cases := []struct {
		name   string
		secret string
	}{
		// Verbatim from .env.example — long enough to pass a length check, which
		// is exactly why length alone is not the test.
		{"env.example value", "changeme-use-a-long-random-string-in-production"},
		{"bare changeme", "changeme"},
		{"decorated placeholder", "CHANGEME-1234567890-1234567890-1234"},
		{"hyphenated variant", "change-me-before-going-to-production-x"},
		{"dev seed password", "password123"},
		{"i'll fix it later", "my-super-secret-key-for-sub12-prod-1"},
		{"placeholder marker", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
		{"empty", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := productionConfig()
			cfg.JWTSecret = tc.secret
			err := cfg.Validate()
			if err == nil {
				t.Fatal("expected a placeholder JWT_SECRET to be refused in production")
			}
			if !strings.Contains(err.Error(), "JWT_SECRET") {
				t.Errorf("error %q should name JWT_SECRET so the operator knows what to fix", err.Error())
			}
		})
	}
}

func TestValidateProductionRejectsShortJWTSecret(t *testing.T) {
	cfg := productionConfig()
	cfg.JWTSecret = "wTq8kZ4vN2mJ7pR1yB6x" // 20 chars, random, still too short
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected a short JWT_SECRET to be refused")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("error %q should name JWT_SECRET", err.Error())
	}
}

func TestValidateProductionRejectsPlaceholderDBPassword(t *testing.T) {
	cfg := productionConfig()
	cfg.DBPassword = "changeme"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected the published DB_PASSWORD placeholder to be refused")
	}
	if !strings.Contains(err.Error(), "DB_PASSWORD") {
		t.Errorf("error %q should name DB_PASSWORD", err.Error())
	}
}

func TestValidateProductionRequiresDatabaseTLS(t *testing.T) {
	for _, mode := range []string{"disable", "prefer", "allow", ""} {
		t.Run("mode="+mode, func(t *testing.T) {
			cfg := productionConfig()
			cfg.DBSSLMode = mode
			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected DB_SSLMODE=%q to be refused in production", mode)
			}
			if !strings.Contains(err.Error(), "DB_SSLMODE") {
				t.Errorf("error %q should name DB_SSLMODE", err.Error())
			}
			// The message has to name the way out, or an operator running the
			// shipped compose stack is stuck with no path forward.
			if !strings.Contains(err.Error(), "DB_ALLOW_INSECURE_LOCAL_NETWORK") {
				t.Errorf("error %q should tell the operator how to opt out deliberately", err.Error())
			}
		})
	}

	// The shipped docker-compose topology: Postgres on a private bridge with no
	// published port. Unencrypted is fine there, but only once said out loud.
	t.Run("explicit opt-out is honoured", func(t *testing.T) {
		cfg := productionConfig()
		cfg.DBSSLMode = "disable"
		cfg.DBAllowInsecureLocalNetwork = true
		if err := cfg.Validate(); err != nil {
			t.Fatalf("DB_ALLOW_INSECURE_LOCAL_NETWORK should permit an unencrypted local connection, got %v", err)
		}
	})

	// The opt-out is about TLS only — it must not become a way past everything
	// else in this function.
	t.Run("opt-out does not excuse a published secret", func(t *testing.T) {
		cfg := productionConfig()
		cfg.DBSSLMode = "disable"
		cfg.DBAllowInsecureLocalNetwork = true
		cfg.JWTSecret = "changeme"
		if err := cfg.Validate(); err == nil {
			t.Fatal("expected JWT_SECRET to still be checked")
		}
	})

	for _, mode := range []string{"require", "verify-ca", "verify-full", "VERIFY-FULL"} {
		t.Run("accepts="+mode, func(t *testing.T) {
			cfg := productionConfig()
			cfg.DBSSLMode = mode
			if err := cfg.Validate(); err != nil {
				t.Fatalf("DB_SSLMODE=%q should be accepted, got %v", mode, err)
			}
		})
	}
	t.Run("rejects nonsense", func(t *testing.T) {
		cfg := productionConfig()
		cfg.DBSSLMode = "yes-please"
		if err := cfg.Validate(); err == nil {
			t.Fatal("expected an unrecognised libpq TLS mode to be refused")
		}
	})
}

// A wildcard here is worse than useless: the API sets
// Access-Control-Allow-Credentials so the refresh cookie is delivered, and a
// browser refuses `*` on a credentialed request. Every user's token refresh
// would fail, with nothing in the server logs to explain it.
func TestValidateProductionRejectsBadCORSOrigin(t *testing.T) {
	cases := []struct {
		name   string
		origin string
	}{
		{"wildcard", "*"},
		{"wildcard subdomain", "https://*.sub12.io"},
		{"localhost", "http://localhost:5173"},
		{"empty", ""},
		{"whitespace", "   "},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := productionConfig()
			cfg.CORSOrigin = tc.origin
			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected CORS_ORIGIN=%q to be refused", tc.origin)
			}
			if !strings.Contains(err.Error(), "CORS_ORIGIN") {
				t.Errorf("error %q should name CORS_ORIGIN", err.Error())
			}
		})
	}
}

func TestValidateProductionChecksAdminPasswordOnlyWhenSeeding(t *testing.T) {
	t.Run("ignored when seeding is off", func(t *testing.T) {
		cfg := productionConfig()
		cfg.SeedAdmin = false
		cfg.AdminPassword = "" // the normal steady state
		if err := cfg.Validate(); err != nil {
			t.Fatalf("ADMIN_PASSWORD should be irrelevant with SEED_ADMIN off, got %v", err)
		}
	})

	cases := []struct{ name, password string }{
		{"empty", ""},
		{"dev seed password", "password123"},
		{"too short", "Rk4wQ2zX"},
	}
	for _, tc := range cases {
		t.Run("refused when seeding: "+tc.name, func(t *testing.T) {
			cfg := productionConfig()
			cfg.SeedAdmin = true
			cfg.AdminPassword = tc.password
			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected ADMIN_PASSWORD=%q to be refused with SEED_ADMIN on", tc.password)
			}
			if !strings.Contains(err.Error(), "ADMIN_PASSWORD") &&
				!strings.Contains(err.Error(), "SEED_ADMIN") {
				t.Errorf("error %q should name ADMIN_PASSWORD or SEED_ADMIN", err.Error())
			}
		})
	}

	t.Run("accepted when strong", func(t *testing.T) {
		cfg := productionConfig()
		cfg.SeedAdmin = true
		cfg.AdminPassword = "K4nR7wQ2zXpL9vB6mT1y"
		if err := cfg.Validate(); err != nil {
			t.Fatalf("expected a strong ADMIN_PASSWORD to be accepted, got %v", err)
		}
	})
}

// An operator bringing up a new deployment should get the whole list at once,
// not discover the next problem on each restart after fixing the last.
func TestValidateReportsEveryProblemAtOnce(t *testing.T) {
	cfg := Config{
		Env:                "production",
		SiteURL:            "http://localhost:5173",
		PasswordResetURL:   "http://localhost:5173/reset-password",
		EventInvitationURL: "https://sub12.io/events/invitations",
		DefaultAvatarURL:   "https://sub12.io/default-avatar.svg",
		JWTSecret:          "changeme-use-a-long-random-string-in-production",
		DBPassword:         "changeme",
		DBSSLMode:          "disable",
		CORSOrigin:         "*",
	}
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected errors, got nil")
	}
	// DB_SSLMODE is absent from this list deliberately: it has an opt-out, so
	// it is checked in its own test rather than here.
	for _, want := range []string{"SITE_URL", "PASSWORD_RESET_URL", "JWT_SECRET", "DB_PASSWORD", "CORS_ORIGIN"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("combined error should mention %s, got:\n%s", want, err.Error())
		}
	}
}

// Everything above is production-only on purpose: `make dev` runs against
// localhost with a throwaway password, and none of these checks should make that
// harder.
func TestValidateDevelopmentAllowsEverything(t *testing.T) {
	c := Config{
		Env:                "development",
		SiteURL:            "http://localhost:5173",
		PasswordResetURL:   "http://localhost:5173/reset-password",
		EventInvitationURL: "http://localhost:5173/events/invitations",
		DefaultAvatarURL:   "http://localhost:5173/default-avatar.svg",
		JWTSecret:          "changeme",
		DBPassword:         "changeme",
		DBSSLMode:          "disable",
		CORSOrigin:         "http://localhost:5173",
		SeedAdmin:          true,
		AdminPassword:      "password123",
	}
	if err := c.Validate(); err != nil {
		t.Fatalf("expected no error in development, got %v", err)
	}
}

// The .env.example file is the thing an operator copies. If a value in it would
// pass production validation, the guard is not doing its job — and if this test
// fails after someone edits that file, the new value is a real secret that
// should never have been committed.
func TestPlaceholdersInEnvExampleAreRefused(t *testing.T) {
	for _, secret := range []string{
		"changeme", // DB_PASSWORD in .env.example
		"changeme-use-a-long-random-string-in-production", // JWT_SECRET in .env.example
	} {
		if !isPlaceholderSecret(secret) {
			t.Errorf("%q ships in .env.example and must be refused in production", secret)
		}
	}
}

func TestIsPlaceholderSecretAcceptsGeneratedSecrets(t *testing.T) {
	// Shapes `openssl rand -base64 48` and `head -c 32 /dev/urandom | base64`
	// actually produce. A false positive here bricks a correctly configured
	// deployment, so it matters as much as the negative cases.
	for _, secret := range []string{
		"wTq8kZ4vN2mJ7pR1yB6xH3sL9dF5gC0aQeUiOoPzXcVbNmAsDfGh",
		"K4nR7wQ2zXpL9vB6mT1yH8sJ3dG5fC0a",
		"aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSByZWFsIGtleSBhdCBhbGw=",
	} {
		if isPlaceholderSecret(secret) {
			t.Errorf("%q is a generated secret and must be accepted", secret)
		}
	}
}
