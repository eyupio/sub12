package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrInvalidResetToken  = errors.New("invalid or expired reset token")
	ErrTOTPRequired       = errors.New("totp verification required")
)

const (
	refreshTokenTTL = 30 * 24 * time.Hour
	// refreshTokenGracePeriod is how long a just-rotated refresh token stays
	// valid after a successful Refresh. It covers the window where a hard page
	// reload (Ctrl+F5) aborts the refresh response after the server has rotated
	// the token but before the browser commits the new cookie, leaving the
	// browser to re-present the old token on the next load. Without it, that
	// stale token is rejected and the user is spuriously logged out.
	refreshTokenGracePeriod = 30 * time.Second
	refreshKeyPrefix        = "refresh:"
	userTokensPrefix        = "user_refresh:"
	userGraceTokensPrefix   = "user_refresh_grace:"
	challengeTokenTTL       = 5 * time.Minute
	challengeTokenPurpose   = "2fa_challenge"
	purposeClaim            = "purpose"
)

// dummyBcryptHash is compared against the submitted password when Login
// targets an account that does not exist (or has no password hash — i.e. an
// OAuth-only account). Running bcrypt in that branch keeps Login's response
// time roughly independent of whether the email is registered, closing the
// user-enumeration timing side channel. The plaintext behind this hash is
// 32 bytes drawn from crypto/rand at package init and immediately discarded,
// so no attacker-submitted password can ever match it, and its cost matches
// bcrypt.DefaultCost — the same cost real password hashes use.
var dummyBcryptHash []byte

func init() {
	// 32 bytes from crypto/rand is unknowable to any caller; discarded
	// after we hash it so it never lives in memory beyond this init.
	seed := make([]byte, 32)
	if _, err := rand.Read(seed); err != nil {
		// Fall back to a pre-computed valid hash so Login still runs a
		// comparison rather than short-circuiting. This branch would only
		// fire if the OS RNG were unavailable at process start.
		dummyBcryptHash = []byte("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")
		return
	}
	if h, err := bcrypt.GenerateFromPassword(seed, bcrypt.DefaultCost); err == nil {
		dummyBcryptHash = h
	} else {
		dummyBcryptHash = []byte("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")
	}
}

type AuthService struct {
	users               *repository.UserRepository
	passwordResetTokens *repository.PasswordResetTokenRepository
	redis               *redis.Client
	emailSender         *EmailSenderService
	log                 zerolog.Logger
	jwtSecret           []byte
	jwtExpiry           time.Duration
	passwordResetTTL    time.Duration
	passwordResetURL    string
	twoFactor           *TwoFactorService
}

// SetTwoFactor wires the 2FA service after construction. Done post-init to
// avoid a circular dependency between AuthService and TwoFactorService at
// instantiation time.
func (s *AuthService) SetTwoFactor(tf *TwoFactorService) {
	s.twoFactor = tf
}

func NewAuthService(
	users *repository.UserRepository,
	passwordResetTokens *repository.PasswordResetTokenRepository,
	rdb *redis.Client,
	emailSender *EmailSenderService,
	log zerolog.Logger,
	jwtSecret string,
	jwtExpiryHours int,
	passwordResetTTLMinutes int,
	passwordResetURL string,
) *AuthService {
	return &AuthService{
		users:               users,
		passwordResetTokens: passwordResetTokens,
		redis:               rdb,
		emailSender:         emailSender,
		log:                 log,
		jwtSecret:           []byte(jwtSecret),
		jwtExpiry:           time.Duration(jwtExpiryHours) * time.Hour,
		passwordResetTTL:    time.Duration(passwordResetTTLMinutes) * time.Minute,
		passwordResetURL:    strings.TrimSpace(passwordResetURL),
	}
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds
}

type AuthPrincipal struct {
	UserID string
	Role   string
}

// Register creates a new user and returns a token pair.
func (s *AuthService) Register(ctx context.Context, email, displayName, password string) (*model.User, *TokenPair, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, strings.ToLower(email), displayName, string(hash))
	if err != nil {
		return nil, nil, err // ErrConflict propagates
	}

	tokens, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return nil, nil, err
	}

	return user, tokens, nil
}

// Login authenticates the user. When 2FA is enabled on the account, the
// returned TokenPair is nil and a non-empty challengeToken is returned
// instead — the caller must exchange it via CompleteLoginWith2FA after
// presenting a valid TOTP or backup code.
func (s *AuthService) Login(ctx context.Context, email, password string) (*model.User, *TokenPair, string, error) {
	user, err := s.users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Run bcrypt against a dummy hash so response time does not
			// reveal whether the account exists (user enumeration).
			_ = bcrypt.CompareHashAndPassword(dummyBcryptHash, []byte(password))
			return nil, nil, "", ErrInvalidCredentials
		}
		return nil, nil, "", err
	}

	if user.PasswordHash == nil {
		// OAuth-only account. Still run bcrypt so timing matches the
		// password-account path and does not leak account existence.
		_ = bcrypt.CompareHashAndPassword(dummyBcryptHash, []byte(password))
		return nil, nil, "", ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, "", ErrInvalidCredentials
	}

	if deleted, err := s.users.IsDeleted(ctx, user.ID); err == nil && deleted {
		return nil, nil, "", ErrInvalidCredentials
	}

	if user.TOTPEnabled {
		challenge, err := s.issueChallengeToken(user.ID)
		if err != nil {
			return nil, nil, "", err
		}
		return user, nil, challenge, nil
	}

	tokens, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return nil, nil, "", err
	}

	return user, tokens, "", nil
}

// CompleteLoginWith2FA exchanges a valid challenge token + TOTP/backup code
// for a full token pair. The challenge token alone cannot authenticate API
// calls; ValidateAccessToken rejects any token that carries a purpose claim.
func (s *AuthService) CompleteLoginWith2FA(ctx context.Context, challengeToken, code string) (*model.User, *TokenPair, error) {
	if s.twoFactor == nil {
		return nil, nil, fmt.Errorf("two-factor service not wired")
	}
	userID, err := s.ValidateChallengeToken(challengeToken)
	if err != nil {
		return nil, nil, ErrInvalidToken
	}
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, ErrInvalidCredentials
	}
	if !user.TOTPEnabled {
		return nil, nil, ErrInvalidCredentials
	}
	if err := s.twoFactor.VerifyTOTPOrBackup(ctx, userID, code); err != nil {
		return nil, nil, ErrInvalidTOTP
	}
	tokens, err := s.issueTokens(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	return user, tokens, nil
}

// RequestPasswordReset records a reset token and sends a reset email if the account exists.
// It should be used with a generic success response to prevent account enumeration.
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) error {
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	s.log.Info().Str("event", "password_reset_requested").Str("email", normalizedEmail).Msg("audit")

	user, err := s.users.GetByEmail(ctx, normalizedEmail)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return err
	}

	token, err := generateToken()
	if err != nil {
		return fmt.Errorf("generate reset token: %w", err)
	}
	tokenHash := hashToken(token)
	expiresAt := time.Now().Add(s.passwordResetTTL)
	if err := s.passwordResetTokens.Create(ctx, user.ID, tokenHash, expiresAt); err != nil {
		return err
	}

	resetLink := s.buildResetLink(token)
	if s.emailSender != nil {
		if err := s.emailSender.SendForgotPassword(ctx, user.Email, user.DisplayName, resetLink, expiresAt); err != nil {
			s.log.Error().Err(err).Str("event", "password_reset_email_failed").Str("user_id", user.ID).Msg("audit")
		}
	}

	return nil
}

func (s *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error {
	userID, err := s.passwordResetTokens.Consume(ctx, hashToken(strings.TrimSpace(token)))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			s.log.Warn().Str("event", "password_reset_failed").Msg("audit")
			return ErrInvalidResetToken
		}
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.users.UpdatePasswordHash(ctx, userID, string(hash)); err != nil {
		return err
	}
	if err := s.InvalidateAllRefreshTokens(ctx, userID); err != nil {
		return err
	}

	s.log.Info().Str("event", "password_reset_completed").Str("user_id", userID).Msg("audit")
	return nil
}

// Refresh validates a refresh token and issues a new token pair.
// New tokens are issued first; the old token is revoked only on success so a
// Redis/network failure cannot permanently lock the user out.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	userID, err := s.validateRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, ErrInvalidToken
	}

	tokens, err := s.issueTokens(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Demote the old token to a short grace TTL instead of deleting it outright.
	// A hard page reload (Ctrl+F5) can abort the refresh response after the new
	// pair is issued but before the browser commits the new cookie, so the next
	// load re-presents this old token; the grace window lets that retry succeed
	// instead of forcing a logout. The token is moved out of the active set into
	// a self-expiring grace set, which InvalidateAllRefreshTokens also revokes,
	// so a password reset still terminates the session during the window and the
	// active set never accumulates dead entries. Failures here leave the old
	// token valid until its original TTL; log them rather than swallow them.
	if err := s.redis.Expire(ctx, refreshKeyPrefix+refreshToken, refreshTokenGracePeriod).Err(); err != nil {
		s.log.Error().Err(err).Str("event", "refresh_token_grace_failed").Str("user_id", userID).Msg("audit")
	}
	if err := s.redis.SMove(ctx, userTokensPrefix+userID, userGraceTokensPrefix+userID, refreshToken).Err(); err != nil {
		s.log.Error().Err(err).Str("event", "refresh_token_grace_failed").Str("user_id", userID).Msg("audit")
	}
	if err := s.redis.Expire(ctx, userGraceTokensPrefix+userID, refreshTokenGracePeriod).Err(); err != nil {
		s.log.Error().Err(err).Str("event", "refresh_token_grace_failed").Str("user_id", userID).Msg("audit")
	}

	return tokens, nil
}

// Logout revokes the refresh token.
func (s *AuthService) Logout(ctx context.Context, refreshToken string) {
	if refreshToken == "" {
		return
	}
	userID, _ := s.validateRefreshToken(ctx, refreshToken)
	if err := s.redis.Del(ctx, refreshKeyPrefix+refreshToken).Err(); err != nil {
		s.log.Error().Err(err).Str("event", "logout_token_revoke_failed").Str("user_id", userID).Msg("audit")
	}
	if userID != "" {
		if err := s.redis.SRem(ctx, userTokensPrefix+userID, refreshToken).Err(); err != nil {
			s.log.Error().Err(err).Str("event", "logout_token_revoke_failed").Str("user_id", userID).Msg("audit")
		}
	}
}

// jwtKeyFunc returns the JWT key function shared between ValidateAccessToken
// and ValidateChallengeToken. Centralising it ensures that any change to
// the accepted signing algorithm or key applies to both token types at once.
func (s *AuthService) jwtKeyFunc() jwt.Keyfunc {
	return func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	}
}

// ValidateAccessToken parses and validates a JWT, returning the user ID.
// Tokens carrying a non-empty `purpose` claim (e.g. 2FA challenge tokens) are
// rejected — only true access tokens, which omit the claim, may authenticate
// API calls.
func (s *AuthService) ValidateAccessToken(tokenStr string) (*AuthPrincipal, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, s.jwtKeyFunc(), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	if p, _ := claims[purposeClaim].(string); p != "" {
		return nil, ErrInvalidToken
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, ErrInvalidToken
	}

	role, _ := claims["role"].(string)
	if role == "" {
		role = "user"
	}

	return &AuthPrincipal{UserID: sub, Role: role}, nil
}

// issueChallengeToken mints a short-lived JWT carrying purpose=2fa_challenge.
// It uses the same HMAC secret as access tokens; the purpose claim is the
// only thing that distinguishes them, and ValidateAccessToken rejects any
// token where the claim is set.
func (s *AuthService) issueChallengeToken(userID string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":        userID,
		purposeClaim: challengeTokenPurpose,
		"iat":        now.Unix(),
		"exp":        now.Add(challengeTokenTTL).Unix(),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("sign challenge token: %w", err)
	}
	return token, nil
}

// ValidateChallengeToken parses a 2FA challenge token and returns the user
// ID it was issued for. Any token without purpose=2fa_challenge is rejected,
// so an access token cannot be replayed against the verify-2fa endpoint.
func (s *AuthService) ValidateChallengeToken(tokenStr string) (string, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, s.jwtKeyFunc(), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}
	if p, _ := claims[purposeClaim].(string); p != challengeTokenPurpose {
		return "", ErrInvalidToken
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", ErrInvalidToken
	}
	return sub, nil
}

func (s *AuthService) issueTokens(ctx context.Context, userID string) (*TokenPair, error) {
	// Access token (JWT)
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": userID,
		"iat": now.Unix(),
		"exp": now.Add(s.jwtExpiry).Unix(),
	}
	user, err := s.users.GetByID(ctx, userID)
	if err == nil && user.Role != "" {
		claims["role"] = user.Role
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("sign jwt: %w", err)
	}

	// Refresh token (random opaque token stored in Redis)
	refreshToken, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	if err := s.redis.Set(ctx, refreshKeyPrefix+refreshToken, userID, refreshTokenTTL).Err(); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}
	// The token must also live in the per-user set so InvalidateAllRefreshTokens
	// can revoke it after a password reset or email change. If we can't add it
	// to the set, drop the token we just stored rather than issue an
	// unrevokable credential.
	if err := s.redis.SAdd(ctx, userTokensPrefix+userID, refreshToken).Err(); err != nil {
		s.redis.Del(ctx, refreshKeyPrefix+refreshToken)
		return nil, fmt.Errorf("track refresh token: %w", err)
	}
	if err := s.redis.Expire(ctx, userTokensPrefix+userID, refreshTokenTTL).Err(); err != nil {
		s.redis.Del(ctx, refreshKeyPrefix+refreshToken)
		s.redis.SRem(ctx, userTokensPrefix+userID, refreshToken)
		return nil, fmt.Errorf("set refresh token ttl: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.jwtExpiry.Seconds()),
	}, nil
}

func (s *AuthService) validateRefreshToken(ctx context.Context, token string) (string, error) {
	userID, err := s.redis.Get(ctx, refreshKeyPrefix+token).Result()
	if err != nil {
		return "", err
	}
	return userID, nil
}

// InvalidateAllRefreshTokens revokes every refresh token issued for a user,
// forcing them to re-authenticate. Used after security-sensitive changes such
// as password resets and email changes.
func (s *AuthService) InvalidateAllRefreshTokens(ctx context.Context, userID string) error {
	tokens, err := s.redis.SMembers(ctx, userTokensPrefix+userID).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("load user refresh tokens: %w", err)
	}
	// Recently rotated tokens linger in the grace set for refreshTokenGracePeriod
	// (see Refresh). Revoke those too so a password reset or email change can't
	// be undone by a still-valid graced token re-minting a fresh pair.
	graceTokens, err := s.redis.SMembers(ctx, userGraceTokensPrefix+userID).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("load user grace refresh tokens: %w", err)
	}
	tokens = append(tokens, graceTokens...)

	if len(tokens) > 0 {
		keys := make([]string, 0, len(tokens))
		for _, token := range tokens {
			keys = append(keys, refreshKeyPrefix+token)
		}
		s.redis.Del(ctx, keys...)
	}
	s.redis.Del(ctx, userTokensPrefix+userID, userGraceTokensPrefix+userID)
	return nil
}

func (s *AuthService) buildResetLink(token string) string {
	base := s.passwordResetURL
	if base == "" {
		base = "http://localhost:5173/reset-password"
	}
	// Token is delivered in the URL fragment so it isn't sent to the server
	// in access logs / Referer headers, and isn't recorded in the browser
	// history bar the way a query string is. The frontend reads it from
	// window.location.hash and clears it after use.
	if i := strings.Index(base, "#"); i >= 0 {
		base = base[:i]
	}
	return base + "#token=" + url.QueryEscape(token)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
