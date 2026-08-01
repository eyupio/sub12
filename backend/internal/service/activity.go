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

// AchievementCounter returns the number of distinct users who have earned each
// of the given achievement ids. Used to enrich feed cards with a live count.
type AchievementCounter interface {
	CountEarners(ctx context.Context, ids []string) (map[string]int, error)
}

// SimulatedContentFilter is satisfied by the simulation service. When the admin
// has disabled including simulated content in public surfaces, the feed
// excludes activities produced by simulated accounts.
type SimulatedContentFilter interface {
	ExcludeSimulatedFromPublic() bool
}

type ActivityService struct {
	repo               *repository.ActivityRepository
	log                zerolog.Logger
	leagueMembers      MemberChecker      // nil disables league feed
	clubMembers        MemberChecker      // nil disables club feed
	achievementCounter AchievementCounter // nil disables earner-count enrichment
	simFilter          SimulatedContentFilter // nil = include simulated
}

func NewActivityService(repo *repository.ActivityRepository, log zerolog.Logger, leagueMembers, clubMembers MemberChecker, achievementCounter AchievementCounter) *ActivityService {
	return &ActivityService{repo: repo, log: log, leagueMembers: leagueMembers, clubMembers: clubMembers, achievementCounter: achievementCounter}
}

// SetSimulatedContentFilter wires the simulation public-content toggle so the
// feed can exclude simulated activity when the admin has disabled it.
func (s *ActivityService) SetSimulatedContentFilter(f SimulatedContentFilter) {
	s.simFilter = f
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

// RemoveReviewRequestFromFeed removes community_review_requested activities
// tied to a cancelled review request.
func (s *ActivityService) RemoveReviewRequestFromFeed(ctx context.Context, scoreCardID string) {
	if scoreCardID == "" {
		return
	}
	if err := s.repo.DeleteReviewRequestActivities(ctx, scoreCardID); err != nil {
		s.log.Warn().Err(err).Str("score_card_id", scoreCardID).Msg("activity: failed to delete review request activity")
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

	// Exclude simulated content from the public and for_you feeds when the
	// admin toggle is off. League/club feeds are left untouched since
	// simulated accounts are not members of those groups.
	if s.simFilter != nil && s.simFilter.ExcludeSimulatedFromPublic() {
		if req.Filter == model.FeedPublic || req.Filter == model.FeedForYou {
			req.ExcludeSimulated = true
		}
	}

	items, err := s.repo.GetFeedFiltered(ctx, req)
	if err != nil {
		return nil, err
	}

	s.enrichAchievementCounts(ctx, items)
	var nextCursor string
	if len(items) == req.Limit {
		nextCursor = items[len(items)-1].CreatedAt.UTC().Format(time.RFC3339Nano)
	}
	return &model.FeedResponse{Items: items, Cursor: nextCursor}, nil
}

var ErrActivityNotFound = errors.New("activity not found")

// DeleteOwn permanently removes an activity that belongs to the calling user.
// Returns ErrActivityNotFound when the activity does not exist or is owned by someone else.
func (s *ActivityService) DeleteOwn(ctx context.Context, activityID, userID string) error {
	if err := s.repo.DeleteOwn(ctx, activityID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrActivityNotFound
		}
		return err
	}
	return nil
}

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

// enrichAchievementCounts overwrites the Metadata of each achievement_earned
// activity with a copy that includes the live earner count. The count is
// computed in a single batched query against user_achievements. Failures are
// logged but non-fatal — the feed still renders without the count.
func (s *ActivityService) enrichAchievementCounts(ctx context.Context, items []*model.Activity) {
	if s.achievementCounter == nil || len(items) == 0 {
		return
	}

	type pending struct {
		item *model.Activity
		meta model.AchievementEarnedMeta
	}
	var pendings []pending
	idSet := make(map[string]struct{})
	for _, it := range items {
		if it == nil || it.Type != model.ActivityAchievementEarned || len(it.Metadata) == 0 {
			continue
		}
		var m model.AchievementEarnedMeta
		if err := json.Unmarshal(it.Metadata, &m); err != nil {
			s.log.Warn().Err(err).Str("activity_id", it.ID).Msg("activity: decode achievement meta")
			continue
		}
		if m.AchievementID == "" {
			continue
		}
		pendings = append(pendings, pending{item: it, meta: m})
		idSet[m.AchievementID] = struct{}{}
	}
	if len(pendings) == 0 {
		return
	}

	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	counts, err := s.achievementCounter.CountEarners(ctx, ids)
	if err != nil {
		s.log.Warn().Err(err).Msg("activity: count achievement earners")
		return
	}

	for _, p := range pendings {
		p.meta.EarnedCount = counts[p.meta.AchievementID]
		b, err := json.Marshal(p.meta)
		if err != nil {
			s.log.Warn().Err(err).Str("activity_id", p.item.ID).Msg("activity: encode achievement meta")
			continue
		}
		p.item.Metadata = b
	}
}

func truncateForFeed(s string, maxLen int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= maxLen {
		return string(runes)
	}
	return string(runes[:maxLen]) + "..."
}
