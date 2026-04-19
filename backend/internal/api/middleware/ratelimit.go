package middleware

import (
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimitConfig holds the per-bucket limits read from envconfig.
type RateLimitConfig struct {
	Enabled             bool
	FollowPerMin        int
	CommentPerMin       int
	PostPerMin          int
	ReportPerMin        int
	LikePerMin          int
	SocialTogglePerMin  int
	AuthPerMin          int
}

// RateLimiter is a simple token-bucket per (bucket, user) that prefers Redis
// when available and falls back to in-process counters. Admins are exempt.
type RateLimiter struct {
	cfg    RateLimitConfig
	rdb    *redis.Client
	memory sync.Map // key: "bucket:user" → *memBucket
}

type memBucket struct {
	mu       sync.Mutex
	count    int
	windowAt time.Time
}

func NewRateLimiter(cfg RateLimitConfig, rdb *redis.Client) *RateLimiter {
	return &RateLimiter{cfg: cfg, rdb: rdb}
}

// Limit applies the bucket's per-minute limit to the incoming request. If
// limit is 0 or the middleware is disabled it is a no-op. Admins are exempt.
func (rl *RateLimiter) Limit(bucket string) func(http.Handler) http.Handler {
	limit := rl.bucketLimit(bucket)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !rl.cfg.Enabled || limit <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			role, _ := UserRoleFromContext(r.Context())
			if role == "admin" {
				next.ServeHTTP(w, r)
				return
			}
			userID, ok := UserIDFromContext(r.Context())
			var key string
			if ok {
				key = fmt.Sprintf("rl:%s:u:%s", bucket, userID)
			} else {
				// Unauthenticated (e.g. /auth/*) — key by client IP. RealIP
				// middleware populates r.RemoteAddr from X-Forwarded-For when
				// present, so we inherit the LB's trust configuration.
				key = fmt.Sprintf("rl:%s:ip:%s", bucket, clientIP(r))
			}
			allowed, retryAfter := rl.check(r, key, limit)
			if !allowed {
				// Ceiling-divide to seconds — a sub-second TTL would
				// otherwise round down to 0 and send the client into an
				// immediate spin-retry.
				secs := int((retryAfter + time.Second - 1) / time.Second)
				if secs < 1 {
					secs = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(secs))
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (rl *RateLimiter) bucketLimit(bucket string) int {
	switch bucket {
	case "follow":
		return rl.cfg.FollowPerMin
	case "comment":
		return rl.cfg.CommentPerMin
	case "post":
		return rl.cfg.PostPerMin
	case "report":
		return rl.cfg.ReportPerMin
	case "like":
		return rl.cfg.LikePerMin
	case "social_toggle":
		return rl.cfg.SocialTogglePerMin
	case "auth":
		return rl.cfg.AuthPerMin
	}
	return 0
}

// clientIP extracts the best-effort client IP from the request. RealIP
// middleware rewrites r.RemoteAddr from X-Forwarded-For / X-Real-IP when
// configured, so we inherit the LB's trust configuration here.
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func (rl *RateLimiter) check(r *http.Request, key string, limit int) (bool, time.Duration) {
	if rl.rdb != nil {
		ctx := r.Context()
		count, err := rl.rdb.Incr(ctx, key).Result()
		if err == nil {
			// ExpireNX is idempotent: sets the TTL only if the key has no
			// existing expiry. Unlike the prior `if count == 1` branch it
			// recovers when the initial Expire failed or when the key was
			// seeded without a TTL (Redis debugging, DUMP/RESTORE, etc.),
			// preventing the key from becoming a permanent counter.
			_ = rl.rdb.ExpireNX(ctx, key, time.Minute).Err()
			if int(count) > limit {
				ttl, _ := rl.rdb.TTL(ctx, key).Result()
				if ttl <= 0 {
					ttl = time.Minute
				}
				return false, ttl
			}
			return true, 0
		}
		// Redis unhealthy — fall through to memory.
	}
	return rl.checkMemory(key, limit)
}

func (rl *RateLimiter) checkMemory(key string, limit int) (bool, time.Duration) {
	now := time.Now()
	v, _ := rl.memory.LoadOrStore(key, &memBucket{windowAt: now})
	b := v.(*memBucket)
	b.mu.Lock()
	defer b.mu.Unlock()
	if now.Sub(b.windowAt) >= time.Minute {
		b.count = 0
		b.windowAt = now
	}
	b.count++
	if b.count > limit {
		return false, time.Minute - now.Sub(b.windowAt)
	}
	return true, 0
}
