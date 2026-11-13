package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
)

// TestRequestEmailChange_InputValidation locks in the format and length checks
// on the self-service email-change endpoint. The service's old guard
// (non-empty and contains "@") let through "foo@" and megabyte-long values,
// which still reached the DB write and SMTP send.
func TestRequestEmailChange_InputValidation(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
	}{
		{"empty", `{"email":""}`, http.StatusBadRequest},
		{"too_long", `{"email":"` + strings.Repeat("a", 250) + `@example.com"}`, http.StatusBadRequest},
		{"malformed_no_at", `{"email":"nope"}`, http.StatusUnprocessableEntity},
		{"malformed_trailing_at", `{"email":"foo@"}`, http.StatusUnprocessableEntity},
	}
	h := &UserHandler{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/users/me/email", bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, "00000000-0000-0000-0000-000000000001")
			rec := httptest.NewRecorder()
			h.RequestEmailChange(rec, req.WithContext(ctx))
			if rec.Code != tc.want {
				t.Fatalf("status %d want %d (body=%s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}
