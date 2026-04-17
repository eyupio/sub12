package service

import (
	"context"
	"errors"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCannotFollowSelf  = errors.New("cannot follow yourself")
	ErrNotFollowing      = errors.New("not following this user")
	ErrBlockedUser       = errors.New("action not allowed")
	ErrAccessDenied      = errors.New("access denied")
	ErrInvalidDecision   = errors.New("decision must be 'accepted' or 'rejected'")
)

type SocialService struct {
	social *repository.SocialRepository
	blocks *repository.BlockRepository
}

func NewSocialService(social *repository.SocialRepository, blocks *repository.BlockRepository) *SocialService {
	return &SocialService{social: social, blocks: blocks}
}

// Follow creates a follow relationship, or a follow request for private profiles.
// Returns (followed bool, requestCreated bool, err).
func (s *SocialService) Follow(ctx context.Context, followerID, followingID string) (bool, bool, error) {
	if followerID == followingID {
		return false, false, ErrCannotFollowSelf
	}

	// Check block
	blocked, err := s.blocks.IsBlocked(ctx, followerID, followingID)
	if err != nil {
		return false, false, err
	}
	if blocked {
		return false, false, ErrBlockedUser
	}

	// Verify target user exists and get visibility
	profile, err := s.social.GetPublicProfile(ctx, followingID)
	if err != nil {
		return false, false, err // propagates ErrNotFound
	}

	// If private profile, create a follow request instead
	if profile.ProfileVisibility == "private" {
		_, err := s.social.CreateFollowRequest(ctx, followerID, followingID)
		if err != nil {
			return false, false, err
		}
		return false, true, nil
	}

	// Public profile: instant follow
	if err := s.social.Follow(ctx, followerID, followingID); err != nil {
		return false, false, err
	}
	return true, false, nil
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
// If the profile is private and the viewer is not the owner or a follower,
// sensitive fields are redacted and IsPrivate is set to true.
func (s *SocialService) GetPublicProfile(ctx context.Context, profileUserID, viewerID string) (*model.PublicProfileWithFollow, error) {
	// Check block
	if viewerID != "" && viewerID != profileUserID {
		blocked, err := s.blocks.IsBlocked(ctx, viewerID, profileUserID)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, repository.ErrNotFound
		}
	}

	profile, err := s.social.GetPublicProfile(ctx, profileUserID)
	if err != nil {
		return nil, err
	}
	stats, err := s.social.GetFollowStats(ctx, profileUserID, viewerID)
	if err != nil {
		return nil, err
	}

	result := &model.PublicProfileWithFollow{
		PublicProfile: *profile,
		FollowStats:  *stats,
	}

	// Check follow request status
	if viewerID != "" && viewerID != profileUserID {
		reqStatus, err := s.social.GetFollowRequestStatus(ctx, viewerID, profileUserID)
		if err != nil {
			return nil, err
		}
		if reqStatus == "pending" {
			result.FollowRequestStatus = "pending"
		}
	}

	// Redact private profiles for non-owners/non-followers
	if profile.ProfileVisibility == "private" && viewerID != profileUserID && !stats.IsFollowing {
		result.IsPrivate = true
		result.PublicProfile.Bio = nil
		result.PublicProfile.Location = nil
		result.PublicProfile.Club = nil
	}

	return result, nil
}

// ListFollowRequests returns pending follow requests targeting the given user.
func (s *SocialService) ListFollowRequests(ctx context.Context, userID string) ([]*model.FollowRequest, error) {
	return s.social.ListPendingRequests(ctx, userID)
}

// DecideFollowRequest accepts or rejects a follow request.
// On accept, creates the follow relationship.
func (s *SocialService) DecideFollowRequest(ctx context.Context, requestID, userID, decision string) (*model.FollowRequest, error) {
	if decision != "accepted" && decision != "rejected" {
		return nil, ErrInvalidDecision
	}
	fr, err := s.social.DecideFollowRequest(ctx, requestID, userID, decision)
	if err != nil {
		return nil, err
	}
	// If accepted, create the actual follow
	if decision == "accepted" {
		if err := s.social.Follow(ctx, fr.RequesterID, fr.TargetID); err != nil {
			return nil, err
		}
	}
	return fr, nil
}

// ListFollowers returns a paginated list of followers for a user.
func (s *SocialService) ListFollowers(ctx context.Context, profileUserID, viewerID string, limit, offset int) ([]*model.FollowListItem, error) {
	if err := s.checkListAccess(ctx, profileUserID, viewerID); err != nil {
		return nil, err
	}
	return s.social.ListFollowers(ctx, profileUserID, limit, offset)
}

// ListFollowing returns a paginated list of users that a user follows.
func (s *SocialService) ListFollowing(ctx context.Context, profileUserID, viewerID string, limit, offset int) ([]*model.FollowListItem, error) {
	if err := s.checkListAccess(ctx, profileUserID, viewerID); err != nil {
		return nil, err
	}
	return s.social.ListFollowingProfiles(ctx, profileUserID, limit, offset)
}

// checkListAccess verifies the viewer can see follower/following lists.
func (s *SocialService) checkListAccess(ctx context.Context, profileUserID, viewerID string) error {
	return s.CanViewProfile(ctx, profileUserID, viewerID)
}

// CanViewProfile returns nil if the viewer can see private content on the profile
// (follower/following lists, achievements, etc.). Returns repository.ErrNotFound
// for blocked interactions (to avoid enumeration) and ErrAccessDenied for
// privacy violations.
func (s *SocialService) CanViewProfile(ctx context.Context, profileUserID, viewerID string) error {
	if viewerID == profileUserID {
		return nil
	}
	// Block check is bidirectional.
	if viewerID != "" {
		blocked, err := s.blocks.IsBlocked(ctx, viewerID, profileUserID)
		if err != nil {
			return err
		}
		if blocked {
			return repository.ErrNotFound
		}
		reverse, err := s.blocks.IsBlocked(ctx, profileUserID, viewerID)
		if err != nil {
			return err
		}
		if reverse {
			return repository.ErrNotFound
		}
	}
	vis, err := s.social.GetProfileVisibility(ctx, profileUserID)
	if err != nil {
		return err
	}
	if vis == "private" {
		if viewerID == "" {
			return ErrAccessDenied
		}
		isFollowing, err := s.social.IsFollowing(ctx, viewerID, profileUserID)
		if err != nil {
			return err
		}
		if !isFollowing {
			return ErrAccessDenied
		}
	}
	return nil
}
