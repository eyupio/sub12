package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

const testJWTSecret = "test-secret-for-middleware"

func newTestAuth() *service.AuthService {
	// ValidateAccessToken only reads jwtSecret, so repos/redis/emailSender can be nil.
	return service.NewAuthService(nil, nil, nil, nil, zerolog.Nop(), testJWTSecret, 1, 60, "")
}

func signToken(t *testing.T, secret string, claims jwt.MapClaims, method jwt.SigningMethod) string {
	t.Helper()
	tok := jwt.NewWithClaims(method, claims)
	s, err := tok.SignedString([]byte(secret))
	require.NoError(t, err)
	return s
}

func validToken(t *testing.T, userID, role string) string {
	t.Helper()
	return signToken(t, testJWTSecret, jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(time.Hour).Unix(),
	}, jwt.SigningMethodHS256)
}

func noopHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

// --- Authenticate ---

func TestAuthenticate_MissingHeader(t *testing.T) {
	h := middleware.Authenticate(newTestAuth())(noopHandler())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticate_MalformedHeader(t *testing.T) {
	cases := []string{
		"token abc",       // wrong scheme
		"Bearer",          // no token
		"bearer lowercase",
	}
	for _, h := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", h)
		rec := httptest.NewRecorder()
		middleware.Authenticate(newTestAuth())(noopHandler()).ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code, "header=%q", h)
	}
}

func TestAuthenticate_ValidToken_PopulatesContext(t *testing.T) {
	var seenID, seenRole string
	var idOK, roleOK bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenID, idOK = middleware.UserIDFromContext(r.Context())
		seenRole, roleOK = middleware.UserRoleFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+validToken(t, "user-123", "admin"))
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(next).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, idOK)
	assert.True(t, roleOK)
	assert.Equal(t, "user-123", seenID)
	assert.Equal(t, "admin", seenRole)
}

func TestAuthenticate_ExpiredToken(t *testing.T) {
	expired := signToken(t, testJWTSecret, jwt.MapClaims{
		"sub": "user-1",
		"iat": time.Now().Add(-2 * time.Hour).Unix(),
		"exp": time.Now().Add(-1 * time.Hour).Unix(),
	}, jwt.SigningMethodHS256)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+expired)
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(noopHandler()).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticate_WrongSigningKey(t *testing.T) {
	bad := signToken(t, "a-different-secret", jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	}, jwt.SigningMethodHS256)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+bad)
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(noopHandler()).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticate_MissingExpClaim(t *testing.T) {
	// jwt.WithExpirationRequired() should reject tokens without exp.
	noExp := signToken(t, testJWTSecret, jwt.MapClaims{
		"sub": "user-1",
	}, jwt.SigningMethodHS256)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+noExp)
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(noopHandler()).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticate_MissingSubjectClaim(t *testing.T) {
	noSub := signToken(t, testJWTSecret, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	}, jwt.SigningMethodHS256)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+noSub)
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(noopHandler()).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticate_DefaultsRoleToUser(t *testing.T) {
	// Token without role claim: middleware should default to "user".
	noRole := signToken(t, testJWTSecret, jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	}, jwt.SigningMethodHS256)

	var seenRole string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenRole, _ = middleware.UserRoleFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+noRole)
	rec := httptest.NewRecorder()
	middleware.Authenticate(newTestAuth())(next).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user", seenRole)
}

// --- OptionalAuthenticate ---

func TestOptionalAuthenticate_NoHeader_PassesThrough(t *testing.T) {
	var sawID bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, sawID = middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	middleware.OptionalAuthenticate(newTestAuth())(next).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, sawID)
}

func TestOptionalAuthenticate_ValidToken_PopulatesContext(t *testing.T) {
	var seenID string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenID, _ = middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+validToken(t, "user-42", "user"))
	rec := httptest.NewRecorder()
	middleware.OptionalAuthenticate(newTestAuth())(next).ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-42", seenID)
}

func TestOptionalAuthenticate_InvalidToken_PassesThrough(t *testing.T) {
	var sawID bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, sawID = middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer garbage")
	rec := httptest.NewRecorder()
	middleware.OptionalAuthenticate(newTestAuth())(next).ServeHTTP(rec, req)

	// Invalid token must NOT block the request, but also must not populate context.
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, sawID)
}

// --- Context helpers ---

func TestUserIDFromContext_Missing(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	_, ok := middleware.UserIDFromContext(req.Context())
	assert.False(t, ok)
}

func TestUserRoleFromContext_Missing(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	_, ok := middleware.UserRoleFromContext(req.Context())
	assert.False(t, ok)
}

// --- RequireAdmin ---

func TestRequireAdmin_NoRole(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	rec := httptest.NewRecorder()
	middleware.RequireAdmin(noopHandler()).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestRequireAdmin_UserRoleRejected(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+validToken(t, "user-1", "user"))
	rec := httptest.NewRecorder()
	// Chain Authenticate → RequireAdmin to populate the role first.
	h := middleware.Authenticate(newTestAuth())(middleware.RequireAdmin(noopHandler()))
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestRequireAdmin_AdminRoleAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+validToken(t, "user-1", "admin"))
	rec := httptest.NewRecorder()
	h := middleware.Authenticate(newTestAuth())(middleware.RequireAdmin(noopHandler()))
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}
