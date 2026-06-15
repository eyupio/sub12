package service

import (
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// newTestAuthService returns an AuthService with only the fields required
// for token-claim plumbing populated. The DB/Redis-backed methods on this
// instance are NOT safe to call.
func newTestAuthService(t *testing.T) *AuthService {
	t.Helper()
	return &AuthService{
		jwtSecret: []byte("test-secret-for-2fa-claim-guard"),
		jwtExpiry: time.Hour,
	}
}

func TestChallengeToken_RoundTrip(t *testing.T) {
	s := newTestAuthService(t)

	tok, err := s.issueChallengeToken("user-123")
	if err != nil {
		t.Fatalf("issueChallengeToken: %v", err)
	}

	got, err := s.ValidateChallengeToken(tok)
	if err != nil {
		t.Fatalf("ValidateChallengeToken: %v", err)
	}
	if got != "user-123" {
		t.Errorf("ValidateChallengeToken returned %q, want user-123", got)
	}
}

// Critical security property: a challenge token must NOT be usable as an
// access token. They share a signing key; only the `purpose` claim guards
// the boundary, and ValidateAccessToken must enforce it.
func TestChallengeToken_RejectedByValidateAccessToken(t *testing.T) {
	s := newTestAuthService(t)

	tok, err := s.issueChallengeToken("user-456")
	if err != nil {
		t.Fatalf("issueChallengeToken: %v", err)
	}

	_, err = s.ValidateAccessToken(tok)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ValidateAccessToken should reject challenge token, got err=%v", err)
	}
}

// Symmetric guard: a real access token (no purpose claim) must NOT be
// usable to clear the 2FA gate via ValidateChallengeToken.
func TestAccessToken_RejectedByValidateChallengeToken(t *testing.T) {
	s := newTestAuthService(t)

	now := time.Now()
	claims := jwt.MapClaims{
		"sub": "user-789",
		"iat": now.Unix(),
		"exp": now.Add(time.Hour).Unix(),
	}
	access, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		t.Fatalf("sign access token: %v", err)
	}

	_, err = s.ValidateChallengeToken(access)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ValidateChallengeToken should reject access token, got err=%v", err)
	}
}

func TestChallengeToken_RejectedAfterExpiry(t *testing.T) {
	s := newTestAuthService(t)

	now := time.Now().Add(-2 * challengeTokenTTL)
	claims := jwt.MapClaims{
		"sub":        "user-expired",
		purposeClaim: challengeTokenPurpose,
		"iat":        now.Unix(),
		"exp":        now.Add(challengeTokenTTL).Unix(),
	}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		t.Fatalf("sign expired challenge token: %v", err)
	}

	_, err = s.ValidateChallengeToken(expired)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for expired challenge, got %v", err)
	}
}

func TestValidateAccessToken_RejectsAnyPurposeClaim(t *testing.T) {
	s := newTestAuthService(t)

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":        "user-other-purpose",
		purposeClaim: "some-other-purpose",
		"iat":        now.Unix(),
		"exp":        now.Add(time.Hour).Unix(),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		t.Fatalf("sign tagged token: %v", err)
	}

	_, err = s.ValidateAccessToken(tok)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ValidateAccessToken must reject tokens with any purpose claim, got %v", err)
	}
}

// TestValidateAccessToken_RejectsAlgorithmSubstitution verifies that
// ValidateAccessToken rejects tokens signed with a non-HMAC algorithm.
// Both validators share an HMAC secret; the signing-method guard in each
// key function is the only thing that stops an attacker from forging a token
// with RS256 (or any other algorithm) signed by an attacker-controlled key.
// Removing that guard must cause this test to fail.
func TestValidateAccessToken_RejectsAlgorithmSubstitution(t *testing.T) {
	s := newTestAuthService(t)

	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"sub": "attacker",
		"iat": now.Unix(),
		"exp": now.Add(time.Hour).Unix(),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(privKey)
	if err != nil {
		t.Fatalf("sign RS256 token: %v", err)
	}

	_, err = s.ValidateAccessToken(tok)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ValidateAccessToken must reject non-HMAC tokens, got: %v", err)
	}
}

// TestValidateChallengeToken_RejectsAlgorithmSubstitution applies the same
// algorithm-guard check to the 2FA challenge token path.
func TestValidateChallengeToken_RejectsAlgorithmSubstitution(t *testing.T) {
	s := newTestAuthService(t)

	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":        "attacker",
		purposeClaim: challengeTokenPurpose,
		"iat":        now.Unix(),
		"exp":        now.Add(time.Hour).Unix(),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(privKey)
	if err != nil {
		t.Fatalf("sign RS256 challenge token: %v", err)
	}

	_, err = s.ValidateChallengeToken(tok)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ValidateChallengeToken must reject non-HMAC tokens, got: %v", err)
	}
}
