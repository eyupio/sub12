package middleware

import (
	"fmt"
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
			if !ok {
				// Not authenticated — the route will reject anyway, but keep
				// per-IP? For now pass through.
				next.ServeHTTP(w, r)
				return
			}
			key := fmt.Sprintf("rl:%s:%s", bucket, userID)
			allowed, retryAfter := rl.check(r, key, limit)
			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
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
	}
	return 0
}

func (rl *RateLimiter) check(r *http.Request, key string, limit int) (bool, time.Duration) {
	if rl.rdb != nil {
		ctx := r.Context()
		count, err := rl.rdb.Incr(ctx, key).Result()
		if err == nil {
			if count == 1 {
				// first increment — start the 60s window
				_ = rl.rdb.Expire(ctx, key, time.Minute).Err()
			}
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
