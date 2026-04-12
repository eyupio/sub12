package service

import (
	"context"
	"errors"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCannotFollowSelf = errors.New("cannot follow yourself")
	ErrNotFollowing     = errors.New("not following this user")
)

type SocialService struct {
	social *repository.SocialRepository
}

func NewSocialService(social *repository.SocialRepository) *SocialService {
	return &SocialService{social: social}
}

// Follow creates a follow relationship from followerID → followingID.
func (s *SocialService) Follow(ctx context.Context, followerID, followingID string) error {
	if followerID == followingID {
		return ErrCannotFollowSelf
	}
	// Verify target user exists via the social repo's profile query
	_, err := s.social.GetPublicProfile(ctx, followingID)
	if err != nil {
		return err // propagates ErrNotFound
	}
	return s.social.Follow(ctx, followerID, followingID)
}

// Unfollow removes a follow relationship. Returns ErrNotFollowing if it didn't exist.
func (s *SocialService) Unfollow(ctx context.Context, followerID, followingID string) error {
	err := s.social.Unfollow(ctx, followerID, followingID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrNotFollowing
	}
	return err
}

// GetPublicProfile returns a user's public profile enriched with follow stats.
// Pass viewerID="" for unauthenticated callers (is_following will always be false).
func (s *SocialService) GetPublicProfile(ctx context.Context, profileUserID, viewerID string) (*model.PublicProfileWithFollow, error) {
	profile, err := s.social.GetPublicProfile(ctx, profileUserID)
	if err != nil {
		return nil, err
	}
	stats, err := s.social.GetFollowStats(ctx, profileUserID, viewerID)
	if err != nil {
		return nil, err
	}
	return &model.PublicProfileWithFollow{
		PublicProfile: *profile,
		FollowStats:   *stats,
	}, nil
}
