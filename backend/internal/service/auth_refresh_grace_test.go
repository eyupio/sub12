package service

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
)

// newGraceTestAuthService builds an AuthService backed by an in-memory Redis.
// Only the redis-dependent paths (validateRefreshToken,
// InvalidateAllRefreshTokens) are exercised here, so the Postgres-backed user
// repository is intentionally left nil.
func newGraceTestAuthService(t *testing.T) (*AuthService, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return &AuthService{redis: rdb, log: zerolog.Nop()}, mr
}

// TestRefreshToken_GraceWindowKeepsTokenBrieflyValid verifies that a token
// demoted to the grace TTL still validates within the window — this is what
// lets a Ctrl+F5 reload that aborted the previous refresh response retry
// successfully instead of being logged out — and is rejected once the window
// elapses.
func TestRefreshToken_GraceWindowKeepsTokenBrieflyValid(t *testing.T) {
	s, mr := newGraceTestAuthService(t)
	ctx := context.Background()
	const userID = "user-grace"
	const token = "rotated-token"

	// Mimic the state left by Refresh after rotating this token away.
	require.NoError(t, s.redis.Set(ctx, refreshKeyPrefix+token, userID, refreshTokenGracePeriod).Err())
	require.NoError(t, s.redis.SAdd(ctx, userGraceTokensPrefix+userID, token).Err())
	require.NoError(t, s.redis.Expire(ctx, userGraceTokensPrefix+userID, refreshTokenGracePeriod).Err())

	gotUser, err := s.validateRefreshToken(ctx, token)
	require.NoError(t, err, "token must still validate inside the grace window")
	require.Equal(t, userID, gotUser)

	mr.FastForward(refreshTokenGracePeriod + time.Second)

	_, err = s.validateRefreshToken(ctx, token)
	require.Error(t, err, "token must be rejected after the grace window elapses")
}

// TestInvalidateAllRefreshTokens_RevokesGracedTokens guards the security
// property that a password reset / email change still terminates the session:
// tokens sitting in the grace set must be revoked too, otherwise a still-valid
// graced token could mint a fresh long-lived pair and undo the reset.
func TestInvalidateAllRefreshTokens_RevokesGracedTokens(t *testing.T) {
	s, _ := newGraceTestAuthService(t)
	ctx := context.Background()
	const userID = "user-invalidate"
	const activeToken = "active-token"
	const gracedToken = "graced-token"

	require.NoError(t, s.redis.Set(ctx, refreshKeyPrefix+activeToken, userID, refreshTokenTTL).Err())
	require.NoError(t, s.redis.SAdd(ctx, userTokensPrefix+userID, activeToken).Err())
	require.NoError(t, s.redis.Set(ctx, refreshKeyPrefix+gracedToken, userID, refreshTokenGracePeriod).Err())
	require.NoError(t, s.redis.SAdd(ctx, userGraceTokensPrefix+userID, gracedToken).Err())

	require.NoError(t, s.InvalidateAllRefreshTokens(ctx, userID))

	_, err := s.validateRefreshToken(ctx, activeToken)
	require.Error(t, err, "active token must be revoked")
	_, err = s.validateRefreshToken(ctx, gracedToken)
	require.Error(t, err, "graced token must be revoked too")

	require.Equal(t, int64(0), s.redis.Exists(ctx, userTokensPrefix+userID).Val(), "active set must be cleared")
	require.Equal(t, int64(0), s.redis.Exists(ctx, userGraceTokensPrefix+userID).Val(), "grace set must be cleared")
}
