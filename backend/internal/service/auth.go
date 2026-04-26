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
	refreshTokenTTL          = 30 * 24 * time.Hour
	refreshKeyPrefix         = "refresh:"
	userTokensPrefix         = "user_refresh:"
	challengeTokenTTL        = 5 * time.Minute
	challengeTokenPurpose    = "2fa_challenge"
	purposeClaim             = "purpose"
)

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
			return nil, nil, "", ErrInvalidCredentials
		}
		return nil, nil, "", err
	}

	if user.PasswordHash == nil {
		return nil, nil, "", ErrInvalidCredentials // OAuth-only account
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

	// Revoke old token only after the new one is safely stored.
	s.redis.Del(ctx, refreshKeyPrefix+refreshToken)
	s.redis.SRem(ctx, userTokensPrefix+userID, refreshToken)

	return tokens, nil
}

// Logout revokes the refresh token.
func (s *AuthService) Logout(ctx context.Context, refreshToken string) {
	if refreshToken == "" {
		return
	}
	userID, _ := s.validateRefreshToken(ctx, refreshToken)
	s.redis.Del(ctx, refreshKeyPrefix+refreshToken)
	if userID != "" {
		s.redis.SRem(ctx, userTokensPrefix+userID, refreshToken)
	}
}

// ValidateAccessToken parses and validates a JWT, returning the user ID.
// Tokens carrying a non-empty `purpose` claim (e.g. 2FA challenge tokens) are
// rejected — only true access tokens, which omit the claim, may authenticate
// API calls.
func (s *AuthService) ValidateAccessToken(tokenStr string) (*AuthPrincipal, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	}, jwt.WithExpirationRequired())
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
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	}, jwt.WithExpirationRequired())
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
	s.redis.SAdd(ctx, userTokensPrefix+userID, refreshToken)
	s.redis.Expire(ctx, userTokensPrefix+userID, refreshTokenTTL)

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

	if len(tokens) > 0 {
		keys := make([]string, 0, len(tokens))
		for _, token := range tokens {
			keys = append(keys, refreshKeyPrefix+token)
		}
		s.redis.Del(ctx, keys...)
	}
	s.redis.Del(ctx, userTokensPrefix+userID)
	return nil
}

func (s *AuthService) buildResetLink(token string) string {
	base := s.passwordResetURL
	if base == "" {
		base = "http://localhost:5173/reset-password"
	}
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + "token=" + url.QueryEscape(token)
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
