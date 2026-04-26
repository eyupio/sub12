package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// MemberChecker is satisfied by any repository that can check entity membership.
type MemberChecker interface {
	IsMember(ctx context.Context, entityID, userID string) (bool, error)
}

type ActivityService struct {
	repo          *repository.ActivityRepository
	log           zerolog.Logger
	leagueMembers MemberChecker // nil disables league feed
	clubMembers   MemberChecker // nil disables club feed
}

func NewActivityService(repo *repository.ActivityRepository, log zerolog.Logger, leagueMembers, clubMembers MemberChecker) *ActivityService {
	return &ActivityService{repo: repo, log: log, leagueMembers: leagueMembers, clubMembers: clubMembers}
}

// SyncPostEdit patches the feed's post_created metadata after a post edit.
func (s *ActivityService) SyncPostEdit(ctx context.Context, postID, body string, updatedAt time.Time) {
	if postID == "" {
		return
	}
	preview := truncateForFeed(body, 100)
	if err := s.repo.MarkPostEdited(ctx, postID, preview, updatedAt); err != nil {
		s.log.Warn().Err(err).Str("post_id", postID).Msg("activity: failed to sync post edit")
	}
}

// RemovePostFromFeed removes post_created activities tied to a deleted post.
func (s *ActivityService) RemovePostFromFeed(ctx context.Context, postID string) {
	if postID == "" {
		return
	}
	if err := s.repo.DeletePostActivities(ctx, postID); err != nil {
		s.log.Warn().Err(err).Str("post_id", postID).Msg("activity: failed to delete post activity")
	}
}

// Ingest writes an activity event. It is intended to be called as a goroutine
// (fire-and-forget). Always use context.Background() as the context when calling
// from a goroutine to avoid cancellation when the HTTP handler returns. An
// internal timeout bounds the operation so hung goroutines don't leak.
func (s *ActivityService) Ingest(ctx context.Context, userID string, actType model.ActivityType, targetID, targetType *string, meta any, leagueID, clubID *string, visibility string) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	b, err := json.Marshal(meta)
	if err != nil {
		s.log.Warn().Err(err).Str("type", actType).Msg("activity: failed to marshal metadata")
		return
	}
	if err := s.repo.Ingest(ctx, userID, actType, targetID, targetType, b, leagueID, clubID, visibility); err != nil {
		s.log.Warn().Err(err).Str("type", actType).Msg("activity: failed to ingest")
	}
}

// GetFeed returns a paginated activity feed based on the filter in the request.
func (s *ActivityService) GetFeed(ctx context.Context, req model.FeedRequest) (*model.FeedResponse, error) {
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 20
	}
	if req.Filter == "" {
		req.Filter = model.FeedForYou
	}

	isAdmin := req.ViewerRole == "admin"

	switch req.Filter {
	case model.FeedLeague:
		if req.LeagueID == "" {
			return nil, fmt.Errorf("league_id is required for league feed")
		}
		if s.leagueMembers != nil && !isAdmin {
			ok, err := s.leagueMembers.IsMember(ctx, req.LeagueID, req.ViewerID)
			if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return nil, fmt.Errorf("check league membership: %w", err)
			}
			if !ok {
				return nil, fmt.Errorf("not a member of this league")
			}
		}

	case model.FeedClub:
		if req.ClubID == "" {
			return nil, fmt.Errorf("club_id is required for club feed")
		}
		if s.clubMembers != nil && !isAdmin {
			ok, err := s.clubMembers.IsMember(ctx, req.ClubID, req.ViewerID)
			if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return nil, fmt.Errorf("check club membership: %w", err)
			}
			if !ok {
				return nil, fmt.Errorf("not a member of this club")
			}
		}
	}

	items, err := s.repo.GetFeedFiltered(ctx, req)
	if err != nil {
		return nil, err
	}

	var nextCursor string
	if len(items) == req.Limit {
		nextCursor = items[len(items)-1].CreatedAt.UTC().Format(time.RFC3339Nano)
	}
	return &model.FeedResponse{Items: items, Cursor: nextCursor}, nil
}

var ErrActivityNotFound = errors.New("activity not found")

// AdminHide soft-deletes an activity from the feed. Site admin only.
func (s *ActivityService) AdminHide(ctx context.Context, activityID, adminID, reason string) error {
	if err := s.repo.AdminHide(ctx, activityID, adminID, reason); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrActivityNotFound
		}
		return err
	}
	return nil
}

// AdminUnhide restores a previously hidden activity to the feed.
func (s *ActivityService) AdminUnhide(ctx context.Context, activityID string) error {
	if err := s.repo.AdminUnhide(ctx, activityID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrActivityNotFound
		}
		return err
	}
	return nil
}

// GetByID exposes the underlying repository lookup so other services (e.g.
// moderation scope resolution) can locate an activity's league/club.
func (s *ActivityService) GetByID(ctx context.Context, activityID string) (*model.Activity, error) {
	a, err := s.repo.GetByID(ctx, activityID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrActivityNotFound
		}
		return nil, err
	}
	return a, nil
}

func truncateForFeed(s string, maxLen int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= maxLen {
		return string(runes)
	}
	return string(runes[:maxLen]) + "..."
}
