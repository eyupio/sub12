package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var ErrInvalidProfile = errors.New("invalid profile input")

type UserService struct {
	users *repository.UserRepository
}

func NewUserService(users *repository.UserRepository) *UserService {
	return &UserService{users: users}
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
