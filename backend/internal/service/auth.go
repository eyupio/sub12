package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

const (
	refreshTokenTTL  = 30 * 24 * time.Hour
	refreshKeyPrefix = "refresh:"
)

type AuthService struct {
	users     *repository.UserRepository
	redis     *redis.Client
	jwtSecret []byte
	jwtExpiry time.Duration
}

func NewAuthService(
	users *repository.UserRepository,
	rdb *redis.Client,
	jwtSecret string,
	jwtExpiryHours int,
) *AuthService {
	return &AuthService{
		users:     users,
		redis:     rdb,
		jwtSecret: []byte(jwtSecret),
		jwtExpiry: time.Duration(jwtExpiryHours) * time.Hour,
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

// Login authenticates and returns a token pair.
func (s *AuthService) Login(ctx context.Context, email, password string) (*model.User, *TokenPair, error) {
	user, err := s.users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, err
	}

	if user.PasswordHash == nil {
		return nil, nil, ErrInvalidCredentials // OAuth-only account
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return nil, nil, err
	}

	return user, tokens, nil
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

	return tokens, nil
}

// Logout revokes the refresh token.
func (s *AuthService) Logout(ctx context.Context, refreshToken string) {
	s.redis.Del(ctx, refreshKeyPrefix+refreshToken)
}

// ValidateAccessToken parses and validates a JWT, returning the user ID.
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

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
