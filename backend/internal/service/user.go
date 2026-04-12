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

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidProfile          = errors.New("invalid profile input")
	ErrInvalidEmail            = errors.New("invalid email address")
	ErrEmailAlreadyInUse       = errors.New("email already in use")
	ErrInvalidEmailChangeToken = errors.New("invalid or expired email change token")
)

const emailChangeTTL = 24 * time.Hour

type UserService struct {
	users             *repository.UserRepository
	emailChangeTokens *repository.EmailChangeTokenRepository
	emailSender       *EmailSenderService
	log               zerolog.Logger
	frontendURL       string
}

func NewUserService(
	users *repository.UserRepository,
	emailChangeTokens *repository.EmailChangeTokenRepository,
	emailSender *EmailSenderService,
	log zerolog.Logger,
	frontendURL string,
) *UserService {
	return &UserService{
		users:             users,
		emailChangeTokens: emailChangeTokens,
		emailSender:       emailSender,
		log:               log,
		frontendURL:       strings.TrimRight(frontendURL, "/"),
	}
}

// GetPublicProfile returns the public-facing profile for any user by ID.
func (s *UserService) GetPublicProfile(ctx context.Context, id string) (*model.PublicProfile, error) {
	u, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &model.PublicProfile{
		ID:          u.ID,
		DisplayName: u.DisplayName,
		Bio:         u.Bio,
		Location:    u.Location,
		Club:        u.Club,
		AvatarURL:   u.AvatarURL,
		CreatedAt:   u.CreatedAt,
	}, nil
}

// UpdateMe applies a partial update to the authenticated user's own profile.
func (s *UserService) UpdateMe(ctx context.Context, id string, in *model.UpdateProfileInput) (*model.User, error) {
	if in.DisplayName != nil && strings.TrimSpace(*in.DisplayName) == "" {
		return nil, fmt.Errorf("%w: display_name cannot be blank", ErrInvalidProfile)
	}
	return s.users.UpdateMe(ctx, id, in)
}

// UpdateAvatarURL sets the avatar_url for a user.
func (s *UserService) UpdateAvatarURL(ctx context.Context, id, avatarURL string) (*model.User, error) {
	return s.users.UpdateAvatarURL(ctx, id, avatarURL)
}

// RequestEmailChange creates a token and sends a confirmation email to the new address.
func (s *UserService) RequestEmailChange(ctx context.Context, userID, newEmail string) error {
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))
	if newEmail == "" || !strings.Contains(newEmail, "@") {
		return ErrInvalidEmail
	}

	// Check the new email isn't already taken.
	existing, err := s.users.GetByEmail(ctx, newEmail)
	if err == nil && existing.ID != userID {
		return ErrEmailAlreadyInUse
	}
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return err
	}

	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	token, err := generateEmailChangeToken()
	if err != nil {
		return fmt.Errorf("generate email change token: %w", err)
	}
	tokenHash := hashEmailChangeToken(token)
	expiresAt := time.Now().Add(emailChangeTTL)

	if err := s.emailChangeTokens.Create(ctx, userID, newEmail, tokenHash, expiresAt); err != nil {
		return err
	}

	confirmLink := s.buildConfirmLink(token)
	if s.emailSender != nil {
		if err := s.emailSender.SendEmailChangeConfirmation(ctx, newEmail, user.DisplayName, confirmLink, expiresAt); err != nil {
			s.log.Error().Err(err).Str("event", "email_change_send_failed").Str("user_id", userID).Msg("audit")
		}
	}

	s.log.Info().Str("event", "email_change_requested").Str("user_id", userID).Str("new_email", newEmail).Msg("audit")
	return nil
}

// ConfirmEmailChange validates the token and updates the user's email.
func (s *UserService) ConfirmEmailChange(ctx context.Context, token string) (*model.User, error) {
	tokenHash := hashEmailChangeToken(strings.TrimSpace(token))
	userID, newEmail, err := s.emailChangeTokens.Consume(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidEmailChangeToken
		}
		return nil, err
	}

	user, err := s.users.UpdateEmail(ctx, userID, newEmail)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, ErrEmailAlreadyInUse
		}
		return nil, err
	}

	s.log.Info().Str("event", "email_changed").Str("user_id", userID).Str("new_email", newEmail).Msg("audit")
	return user, nil
}

func (s *UserService) buildConfirmLink(token string) string {
	u, _ := url.Parse(s.frontendURL)
	u.Path = "/confirm-email"
	q := u.Query()
	q.Set("token", token)
	u.RawQuery = q.Encode()
	return u.String()
}

func generateEmailChangeToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashEmailChangeToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
