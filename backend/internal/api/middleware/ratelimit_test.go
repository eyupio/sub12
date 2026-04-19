package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

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
