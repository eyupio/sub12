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
	ErrInvalidRole             = errors.New("role must be 'user' or 'admin'")
	ErrCannotTargetSelf        = errors.New("cannot perform this action on your own account")
	ErrAccountDeleted          = errors.New("account has been deleted")
)

const emailChangeTTL = 24 * time.Hour

type UserService struct {
	users             *repository.UserRepository
	emailChangeTokens *repository.EmailChangeTokenRepository
	emailSender       *EmailSenderService
	log               zerolog.Logger
	frontendURL       string

	// Optional repositories wired post-construction via SetExportRepos to
	// power the GDPR data-export endpoint without forcing every caller to
	// pass these through the constructor.
	scoreCards *repository.ScoreCardRepository
	posts      *repository.PostRepository
	clubs      *repository.ClubRepository
	leagues    *repository.LeagueRepository
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

// SetExportRepos wires the repositories needed to aggregate a GDPR data
// export. Wired post-construction to avoid ballooning the constructor.
func (s *UserService) SetExportRepos(scoreCards *repository.ScoreCardRepository, posts *repository.PostRepository, clubs *repository.ClubRepository, leagues *repository.LeagueRepository) {
	s.scoreCards = scoreCards
	s.posts = posts
	s.clubs = clubs
	s.leagues = leagues
}

// RequestDeletion performs a GDPR-compliant account deletion. The user row
// is soft-deleted so references (score cards, comments, league memberships)
// remain intact and existing login/auth paths reject the account.
func (s *UserService) RequestDeletion(ctx context.Context, userID string) error {
	if err := s.users.SoftDelete(ctx, userID); err != nil {
		return err
	}
	s.log.Info().Str("event", "account_deleted").Str("user_id", userID).Msg("audit")
	return nil
}

// ExportData aggregates the authenticated user's core records into a single
// JSON-serializable payload. Missing optional repositories degrade gracefully
// (the corresponding section is emitted as an empty list).
func (s *UserService) ExportData(ctx context.Context, userID string) (map[string]any, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"generated_at": time.Now().UTC(),
		"user":         user,
	}
	if s.scoreCards != nil {
		cards, err := s.scoreCards.ListByUser(ctx, userID, 1000, 0, "all", "")
		if err != nil {
			return nil, fmt.Errorf("export score cards: %w", err)
		}
		payload["score_cards"] = cards
	}
	if s.posts != nil {
		posts, err := s.posts.ListByUser(ctx, userID, 1000, 0)
		if err != nil {
			return nil, fmt.Errorf("export posts: %w", err)
		}
		payload["posts"] = posts
	}
	if s.clubs != nil {
		clubs, err := s.clubs.ListByUser(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("export clubs: %w", err)
		}
		payload["clubs"] = clubs
	}
	if s.leagues != nil {
		leagues, err := s.leagues.ListByUser(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("export leagues: %w", err)
		}
		payload["leagues"] = leagues
	}
	if _, err := s.users.CreateExportRequest(ctx, userID); err != nil {
		s.log.Warn().Err(err).Str("user_id", userID).Msg("export_request_audit_failed")
	}
	s.log.Info().Str("event", "data_exported").Str("user_id", userID).Msg("audit")
	return payload, nil
}

// GetPublicProfile returns the public-facing profile for any user by ID.
func (s *UserService) GetPublicProfile(ctx context.Context, id string) (*model.PublicProfile, error) {
	u, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &model.PublicProfile{
		ID:                u.ID,
		DisplayName:       u.DisplayName,
		Bio:               u.Bio,
		Location:          u.Location,
		Club:              u.Club,
		AvatarURL:         u.AvatarURL,
		ProfileVisibility: u.ProfileVisibility,
		CreatedAt:         u.CreatedAt,
	}, nil
}

// SearchUsers finds users by display_name prefix. Queries shorter than 2
// characters after trimming return no results to avoid unbounded scans.
func (s *UserService) SearchUsers(ctx context.Context, query, viewerID string, limit int) ([]*model.PublicProfile, error) {
	trimmed := strings.TrimSpace(query)
	if len([]rune(trimmed)) < 2 {
		return []*model.PublicProfile{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	return s.users.Search(ctx, trimmed, viewerID, limit)
}

// UpdateMe applies a partial update to the authenticated user's own profile.
func (s *UserService) UpdateMe(ctx context.Context, id string, in *model.UpdateProfileInput) (*model.User, error) {
	if in.DisplayName != nil && strings.TrimSpace(*in.DisplayName) == "" {
		return nil, fmt.Errorf("%w: display_name cannot be blank", ErrInvalidProfile)
	}
	if in.DisplayName != nil && len(*in.DisplayName) > 64 {
		return nil, fmt.Errorf("%w: display_name must be 64 characters or fewer", ErrInvalidProfile)
	}
	if in.ProfileVisibility != nil && *in.ProfileVisibility != "public" && *in.ProfileVisibility != "private" {
		return nil, fmt.Errorf("%w: profile_visibility must be 'public' or 'private'", ErrInvalidProfile)
	}
	if in.DefaultScoreVisibility != nil {
		v := *in.DefaultScoreVisibility
		if v != "public" && v != "followers" && v != "private" {
			return nil, fmt.Errorf("%w: default_score_visibility must be 'public', 'followers', or 'private'", ErrInvalidProfile)
		}
	}
	if in.DefaultDistanceUnit != nil {
		v := *in.DefaultDistanceUnit
		if v != "meters" && v != "yards" {
			return nil, fmt.Errorf("%w: default_distance_unit must be 'meters' or 'yards'", ErrInvalidProfile)
		}
	}
	if in.DefaultMeasurementUnit != nil {
		v := *in.DefaultMeasurementUnit
		if v != "cm" && v != "mm" {
			return nil, fmt.Errorf("%w: default_measurement_unit must be 'cm' or 'mm'", ErrInvalidProfile)
		}
	}
	if in.DateFormat != nil && !IsValidDateFormat(*in.DateFormat) {
		return nil, fmt.Errorf("%w: date_format must be one of %s", ErrInvalidProfile, validDateFormatsList())
	}
	if in.TimeFormat != nil && !IsValidTimeFormat(*in.TimeFormat) {
		return nil, fmt.Errorf("%w: time_format must be '24h' or '12h'", ErrInvalidProfile)
	}
	if in.Timezone != nil && !IsValidTimezone(*in.Timezone) {
		return nil, fmt.Errorf("%w: timezone must be a valid IANA name", ErrInvalidProfile)
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
		s.log.Error().Err(err).Str("user_id", userID).Msg("email_change: lookup new email failed")
		return err
	}

	token, err := generateEmailChangeToken()
	if err != nil {
		return fmt.Errorf("generate email change token: %w", err)
	}
	tokenHash := hashEmailChangeToken(token)
	expiresAt := time.Now().Add(emailChangeTTL)

	if err := s.emailChangeTokens.Create(ctx, userID, newEmail, tokenHash, expiresAt); err != nil {
		s.log.Error().Err(err).Str("user_id", userID).Msg("email_change: create token failed")
		return err
	}

	// Fetch display name for the confirmation email; fall back to the email address.
	displayName := newEmail
	if user, err := s.users.GetByID(ctx, userID); err == nil {
		displayName = user.DisplayName
	} else {
		s.log.Warn().Err(err).Str("user_id", userID).Msg("email_change: could not fetch display name, using email as fallback")
	}

	confirmLink := s.buildConfirmLink(token)
	if s.emailSender != nil {
		if err := s.emailSender.SendEmailChangeConfirmation(ctx, newEmail, displayName, confirmLink, expiresAt); err != nil {
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

// AdminListUsers returns a paginated list of all users with a total count.
func (s *UserService) AdminListUsers(ctx context.Context, limit, offset int) ([]*model.AdminUser, int, error) {
	return s.users.ListAll(ctx, limit, offset)
}

// AdminGetUser returns the full user record (including email) by ID.
func (s *UserService) AdminGetUser(ctx context.Context, id string) (*model.AdminUser, error) {
	return s.users.GetAdminByID(ctx, id)
}

// AdminUpdateRole changes a user's role. The caller may not change their own role.
func (s *UserService) AdminUpdateRole(ctx context.Context, callerID, targetID, role string) (*model.AdminUser, error) {
	if role != "user" && role != "admin" {
		return nil, ErrInvalidRole
	}
	if callerID == targetID {
		return nil, ErrCannotTargetSelf
	}
	u, err := s.users.UpdateRole(ctx, targetID, role)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, repository.ErrNotFound
	}
	return u, err
}

// AdminDeleteUser permanently deletes a user. The caller may not delete their own account.
func (s *UserService) AdminDeleteUser(ctx context.Context, callerID, targetID string) error {
	if callerID == targetID {
		return ErrCannotTargetSelf
	}
	return s.users.Delete(ctx, targetID)
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
