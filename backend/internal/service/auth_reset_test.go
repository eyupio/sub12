package service

import (
	"strings"
	"testing"
)

// TestBuildResetLink_TokenInURLFragment verifies that the password-reset link
// places the one-time token in the URL fragment (#) rather than a query
// parameter (?). This is a deliberate security design: fragment components are
// never sent by browsers in the Referer header, do not appear in server access
// logs, and are not preserved in most browser history entries — all of which
// would expose the credential to unintended parties.
func TestBuildResetLink_TokenInURLFragment(t *testing.T) {
	s := &AuthService{passwordResetURL: "https://app.example.com/reset-password"}
	link := s.buildResetLink("abc123token")

	if strings.Contains(link, "?token=") || strings.Contains(link, "?") {
		t.Errorf("reset link must not expose token as a query parameter (leaks via Referer/logs): %q", link)
	}
	if !strings.Contains(link, "#token=") {
		t.Errorf("reset link must place token in URL fragment, got: %q", link)
	}
}

// TestBuildResetLink_DefaultURLWhenEmpty verifies that an empty
// passwordResetURL falls back to a sensible local default rather than
// producing a broken or empty link.
func TestBuildResetLink_DefaultURLWhenEmpty(t *testing.T) {
	s := &AuthService{passwordResetURL: ""}
	link := s.buildResetLink("mytoken")

	if !strings.Contains(link, "#token=mytoken") {
		t.Errorf("reset link must contain fragment token, got: %q", link)
	}
	if !strings.HasPrefix(link, "http") {
		t.Errorf("reset link must be an absolute URL, got: %q", link)
	}
}

// TestBuildResetLink_StripsExistingFragment verifies that any fragment
// already present in passwordResetURL is removed before appending the token.
// Without this, the URL would contain two '#' characters which browsers
// silently discard past the first, causing the token to never reach the client.
func TestBuildResetLink_StripsExistingFragment(t *testing.T) {
	s := &AuthService{passwordResetURL: "https://app.example.com/reset-password#old-fragment"}
	link := s.buildResetLink("newtoken")

	if count := strings.Count(link, "#"); count != 1 {
		t.Errorf("reset link must contain exactly one '#', got %d in: %q", count, link)
	}
	if !strings.Contains(link, "#token=newtoken") {
		t.Errorf("reset link must contain new token in fragment, got: %q", link)
	}
	if strings.Contains(link, "old-fragment") {
		t.Errorf("reset link must not retain the old fragment, got: %q", link)
	}
}
