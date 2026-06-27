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

func TestValidateProductionRejectsLocalhost(t *testing.T) {
	cases := []struct {
		name string
		cfg  Config
	}{
		{"site url", Config{Env: "production", SiteURL: "http://localhost:5173", PasswordResetURL: "https://sub12.io/r", EventInvitationURL: "https://sub12.io/e", DefaultAvatarURL: "https://sub12.io/default-avatar.svg"}},
		{"reset url", Config{Env: "production", SiteURL: "https://sub12.io", PasswordResetURL: "http://localhost:5173/reset", EventInvitationURL: "https://sub12.io/e", DefaultAvatarURL: "https://sub12.io/default-avatar.svg"}},
		{"invitation url", Config{Env: "production", SiteURL: "https://sub12.io", PasswordResetURL: "https://sub12.io/r", EventInvitationURL: "http://localhost:5173/events/invitations", DefaultAvatarURL: "https://sub12.io/default-avatar.svg"}},
		{"127.0.0.1", Config{Env: "production", SiteURL: "https://sub12.io", PasswordResetURL: "https://sub12.io/r", EventInvitationURL: "https://sub12.io/e", DefaultAvatarURL: "http://127.0.0.1/avatar.svg"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.Validate()
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), "localhost") {
				t.Errorf("error message %q should mention localhost", err.Error())
			}
		})
	}
}

func TestValidateProductionAcceptsPublicURLs(t *testing.T) {
	c := Config{
		Env:                "production",
		SiteURL:            "https://sub12.io",
		PasswordResetURL:   "https://sub12.io/reset-password",
		EventInvitationURL: "https://sub12.io/events/invitations",
		DefaultAvatarURL:   "https://sub12.io/default-avatar.svg",
	}
	if err := c.Validate(); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateDevelopmentAllowsLocalhost(t *testing.T) {
	c := Config{
		Env:                "development",
		SiteURL:            "http://localhost:5173",
		PasswordResetURL:   "http://localhost:5173/reset-password",
		EventInvitationURL: "http://localhost:5173/events/invitations",
		DefaultAvatarURL:   "http://localhost:5173/default-avatar.svg",
	}
	if err := c.Validate(); err != nil {
		t.Fatalf("expected no error in development, got %v", err)
	}
}
