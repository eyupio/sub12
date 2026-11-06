package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/stretchr/testify/assert"
)

// TestRateLimiterXFFSpoofingIsRefused pins the fix for GHSA-3fxj-6jh8-hvhx /
// GHSA-rjr7-jggh-pgcp / GHSA-9g5q-2w5x-hmxf: with chi.RealIP the attacker's
// own X-Forwarded-For entry would land in r.RemoteAddr and flip the bucket on
// every request, letting them brute-force /auth/* indefinitely. The router
// now wires ClientIPFromXFFTrustedProxies(1), which takes the entry the one
// trusted proxy (nginx) appended — so the rate-limit key stays stable no
// matter what header the attacker sends.
func TestRateLimiterXFFSpoofingIsRefused(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{Enabled: true, AuthPerMin: 2}, nil)
	handler := chimiddleware.ClientIPFromXFFTrustedProxies(1)(
		rl.Limit("auth")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})))

	hit := func(spoofed string) int {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		// Simulate nginx: whatever the attacker sent, the real client IP is
		// appended as the rightmost entry. ClientIPFromXFFTrustedProxies(1)
		// reads that entry, not the attacker-chosen ones to its left.
		req.Header.Set("X-Forwarded-For", spoofed+", 198.51.100.9")
		req.RemoteAddr = "10.0.0.1:12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}
	assert.Equal(t, http.StatusOK, hit("1.1.1.1"))
	assert.Equal(t, http.StatusOK, hit("2.2.2.2"))
	// Changing the leftmost XFF entry must not create a fresh bucket.
	assert.Equal(t, http.StatusTooManyRequests, hit("3.3.3.3"))
}

func TestRateLimiterIPBucketUnauthed(t *testing.T) {
	// Unauthenticated request should be keyed by client IP, not pass through.
	rl := NewRateLimiter(RateLimitConfig{
		Enabled:    true,
		AuthPerMin: 2,
	}, nil)

	handler := rl.Limit("auth")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	hit := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = ip + ":12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	assert.Equal(t, http.StatusOK, hit("203.0.113.5"))
	assert.Equal(t, http.StatusOK, hit("203.0.113.5"))
	// Third attempt from the same IP must be throttled.
	assert.Equal(t, http.StatusTooManyRequests, hit("203.0.113.5"))
	// A different IP has its own bucket.
	assert.Equal(t, http.StatusOK, hit("198.51.100.9"))
}

func TestRateLimiterDisabledPassesThrough(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{Enabled: false, AuthPerMin: 1}, nil)
	handler := rl.Limit("auth")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = "203.0.113.5:12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
	}
}

func TestRateLimiterRetryAfterAlwaysAtLeastOne(t *testing.T) {
	// Exceeding the limit must emit Retry-After >= 1 so clients don't
	// immediately spin-retry at the window boundary.
	rl := NewRateLimiter(RateLimitConfig{
		Enabled:    true,
		AuthPerMin: 1,
	}, nil)

	handler := rl.Limit("auth")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		r.RemoteAddr = "203.0.113.7:10000"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, r)
		return rec
	}
	req() // first request consumes the quota
	rec := req()
	assert.Equal(t, http.StatusTooManyRequests, rec.Code)
	assert.NotEmpty(t, rec.Header().Get("Retry-After"))
	assert.NotEqual(t, "0", rec.Header().Get("Retry-After"))
}

func TestRateLimiterUnknownBucketNoop(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{Enabled: true}, nil)
	handler := rl.Limit("nope")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}
