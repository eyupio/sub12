package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestAuth_BodySizeLimit verifies that auth endpoints which previously used a
// raw json.NewDecoder(r.Body) now go through decodeJSON, which caps the body
// at 1 MiB via io.LimitReader. Without this cap an unauthenticated attacker
// can pin server memory by streaming arbitrary JSON to login/register/reset.
//
// Strategy: the LimitReader truncates input at the 1 MiB boundary, so a body
// that *exceeds* the cap is delivered to json.Decode as a malformed,
// half-written document — Decode returns ErrUnexpectedEOF, and the handler
// must respond with 400, never 200.
func TestAuth_BodySizeLimit(t *testing.T) {
	// 2 MiB of padding inside a "display_name" string. This is bigger than
	// the 1 MiB cap, so decodeJSON's LimitReader will truncate it mid-string
	// and Decode must surface an error.
	pad := strings.Repeat("A", 2<<20)
	body := []byte(`{"email":"x@x.test","password":"abcdefgh","display_name":"` + pad + `"}`)

	h := &AuthHandler{}

	cases := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		path    string
	}{
		{"Register", h.Register, "/api/v1/auth/register"},
		{"Login", h.Login, "/api/v1/auth/login"},
		{"LoginVerify2FA", h.LoginVerify2FA, "/api/v1/auth/login/2fa"},
		{"ForgotPassword", h.ForgotPassword, "/api/v1/auth/forgot-password"},
		{"ResetPassword", h.ResetPassword, "/api/v1/auth/reset-password"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.path, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			tc.handler(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s: oversized body must be rejected with 400, got %d (%s)", tc.name, rec.Code, rec.Body.String())
			}
		})
	}
}

// bcrypt refuses passwords over 72 bytes. The handlers must reject them with
// 400 up front: past the handler the service returns a 500, and on reset the
// single-use token has already been consumed by then.
func TestAuth_PasswordOverBcryptLimitIs400(t *testing.T) {
	h := &AuthHandler{}
	long := strings.Repeat("a", 73)

	cases := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
		body    string
	}{
		{"Register", h.Register, `{"email":"x@x.test","display_name":"X","password":"` + long + `"}`},
		{"ResetPassword", h.ResetPassword, `{"token":"t","new_password":"` + long + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/x", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			tc.handler(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s: 73-byte password must be 400, got %d (%s)", tc.name, rec.Code, rec.Body.String())
			}
		})
	}
}
