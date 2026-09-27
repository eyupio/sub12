package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// RequestEmailChange writes newEmail straight into `email_change_tokens.new_email`
// and, on confirm, into `users.email`. The only validation was a bare
// `strings.Contains("@")` — no length cap, no RFC 5322 parse — so an
// authenticated user could PATCH ~1 MiB of "@" (bounded only by decodeJSON's
// per-request cap) and have it persisted, mailed and later re-served on every
// profile view. Register/login/forgot-password/reset already cap at 254 chars
// and use mail.ParseAddress; this brings the email-change path into line.
// Validation runs before the repo call, so nil dependencies are safe here.
func TestUserService_RequestEmailChange_EmailValidation(t *testing.T) {
	svc := NewUserService(nil, nil, nil, zerolog.Nop(), "")

	oversize := strings.Repeat("a", maxEmailLen) + "@example.com"
	for _, tc := range []struct {
		name  string
		email string
	}{
		{"oversized", oversize},
		{"missing local part", "@example.com"},
		{"no domain", "user@"},
		{"just @", "@"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := svc.RequestEmailChange(context.Background(), "u1", tc.email); !errors.Is(err, ErrInvalidEmail) {
				t.Fatalf("RequestEmailChange(%q): got %v, want ErrInvalidEmail", tc.email, err)
			}
		})
	}
}

// UpdateMe writes bio/location/club straight into TEXT columns. Without a
// per-field cap, an authenticated user could PATCH hundreds of KiB into their
// `users` row and have it streamed back on every profile view. The
// display_name cap has been in place for years; these three fields were the
// outlier. Validation runs before the repo call, so a nil UserRepository is
// safe for these cases.
func TestUserService_UpdateMe_FreeTextLengthCaps(t *testing.T) {
	svc := NewUserService(nil, nil, nil, zerolog.Nop(), "")

	bio := strings.Repeat("b", maxUserBioLen+1)
	loc := strings.Repeat("l", maxUserLocationLen+1)
	club := strings.Repeat("c", maxUserClubLen+1)

	for _, tc := range []struct {
		name string
		in   *model.UpdateProfileInput
	}{
		{"bio oversized", &model.UpdateProfileInput{Bio: &bio}},
		{"location oversized", &model.UpdateProfileInput{Location: &loc}},
		{"club oversized", &model.UpdateProfileInput{Club: &club}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := svc.UpdateMe(context.Background(), "u1", tc.in); !errors.Is(err, ErrInvalidProfile) {
				t.Fatalf("UpdateMe: got %v, want ErrInvalidProfile", err)
			}
		})
	}
}
