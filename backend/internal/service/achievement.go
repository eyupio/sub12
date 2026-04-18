package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type AchievementRepo interface {
	Award(ctx context.Context, userID, achievementID string) (bool, error)
	ListForUser(ctx context.Context, userID string) ([]*model.UserAchievement, error)
	GetDef(ctx context.Context, id string) (*model.AchievementDef, error)
	ListDefs(ctx context.Context) ([]*model.AchievementDef, error)
}

type CardCountRepo interface {
	GetCardCount(ctx context.Context, userID string) (int, error)
}

// FollowCountRepo exposes the follower/following counts used by social achievements.
type FollowCountRepo interface {
	CountFollowing(ctx context.Context, userID string) (int, error)
	CountFollowers(ctx context.Context, userID string) (int, error)
}

// CommentCountRepo exposes the per-user comment count.
type CommentCountRepo interface {
	CountByUser(ctx context.Context, userID string) (int, error)
}

// ClubMembershipCountRepo exposes the per-user club membership count.
type ClubMembershipCountRepo interface {
	CountMembershipsByUser(ctx context.Context, userID string) (int, error)
}

// PelletTestCountRepo exposes the per-user pellet-test session count.
type PelletTestCountRepo interface {
	CountByUser(ctx context.Context, userID string) (int, error)
}

type AchievementService struct {
	achievements AchievementRepo
	cards        CardCountRepo
	follows      FollowCountRepo
	comments     CommentCountRepo
	clubs        ClubMembershipCountRepo
	pelletTests  PelletTestCountRepo
	activity     *ActivityService // nil disables feed ingestion
	social       *SocialService   // nil disables privacy enforcement
}

func NewAchievementService(
	achievements AchievementRepo,
	cards CardCountRepo,
	follows FollowCountRepo,
	comments CommentCountRepo,
	clubs ClubMembershipCountRepo,
	pelletTests PelletTestCountRepo,
	activity *ActivityService,
) *AchievementService {
	return &AchievementService{
		achievements: achievements,
		cards:        cards,
		follows:      follows,
		comments:     comments,
		clubs:        clubs,
		pelletTests:  pelletTests,
		activity:     activity,
	}
}

// SetSocial wires the social service used for profile-visibility enforcement.
// Called after construction to avoid a circular dependency with SocialService.
func (s *AchievementService) SetSocial(social *SocialService) {
	s.social = social
}

// award grants an achievement and, when newly awarded, publishes a feed event
// populated with the def's name/icon/description so feed consumers can render
// without a second lookup.
func (s *AchievementService) award(ctx context.Context, userID, achievementID string) {
	awarded, err := s.achievements.Award(ctx, userID, achievementID)
	if err != nil || !awarded || s.activity == nil {
		return
	}
	def, err := s.achievements.GetDef(ctx, achievementID)
	if err != nil || def == nil {
		return
	}
	tt := "achievement"
	meta := model.AchievementEarnedMeta{
		AchievementID:          achievementID,
		AchievementName:        def.Name,
		AchievementIcon:        def.Icon,
		AchievementDescription: def.Description,
	}
	go s.activity.Ingest(context.Background(), userID, model.ActivityAchievementEarned, nil, &tt, meta, nil, nil, "public")
}

// EvaluateForScoreCard checks all score-card achievement rules against the newly
// created card and awards any that pass. Intended to be called in a goroutine
// after card creation. An internal timeout bounds the operation so hung
// goroutines don't leak.
func (s *AchievementService) EvaluateForScoreCard(ctx context.Context, userID string, card *model.ScoreCard) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cardCount, err := s.cards.GetCardCount(ctx, userID)
	if err != nil {
		return
	}

	if cardCount == 1 {
		s.award(ctx, userID, "first_card")
	}
	if card.TotalScore >= 100 {
		s.award(ctx, userID, "century")
	}
	if card.TotalScore == 250 {
		s.award(ctx, userID, "perfect_score")
	}
	if card.XCount >= 5 {
		s.award(ctx, userID, "sharp_eye")
	}
	if card.XCount >= 10 {
		s.award(ctx, userID, "sharpshooter")
	}
	if cardCount >= 10 {
		s.award(ctx, userID, "dedicated")
	}
	if card.LeagueRoundID != nil {
		s.award(ctx, userID, "league_debut")
	}
}

// EvaluateForPersonalBest awards pb_crusher when the supplied card represents
// the user's highest score to date. isPB is computed by the caller (which
// already has the repo) so this method stays count-free and cheap.
func (s *AchievementService) EvaluateForPersonalBest(ctx context.Context, userID string, isPB bool) {
	if !isPB {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	s.award(ctx, userID, "pb_crusher")
}

// EvaluateForFollow awards achievements triggered by a successful follow:
//   - first_follow to the follower on their first follow
//   - social_butterfly to the target when they cross 10 followers
func (s *AchievementService) EvaluateForFollow(ctx context.Context, followerID, followedID string) {
	if s.follows == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if count, err := s.follows.CountFollowing(ctx, followerID); err == nil && count == 1 {
		s.award(ctx, followerID, "first_follow")
	}
	if count, err := s.follows.CountFollowers(ctx, followedID); err == nil && count >= 10 {
		s.award(ctx, followedID, "social_butterfly")
	}
}

// EvaluateForComment awards conversationalist at 10 authored comments.
func (s *AchievementService) EvaluateForComment(ctx context.Context, userID string) {
	if s.comments == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.comments.CountByUser(ctx, userID)
	if err != nil {
		return
	}
	if count >= 10 {
		s.award(ctx, userID, "conversationalist")
	}
}

// EvaluateForClubJoin awards club_member on a user's first club membership.
func (s *AchievementService) EvaluateForClubJoin(ctx context.Context, userID string) {
	if s.clubs == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.clubs.CountMembershipsByUser(ctx, userID)
	if err != nil {
		return
	}
	if count >= 1 {
		s.award(ctx, userID, "club_member")
	}
}

// EvaluateForPelletTest awards pellet_scientist on the user's first pellet-test session.
func (s *AchievementService) EvaluateForPelletTest(ctx context.Context, userID string) {
	if s.pelletTests == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.pelletTests.CountByUser(ctx, userID)
	if err != nil {
		return
	}
	if count >= 1 {
		s.award(ctx, userID, "pellet_scientist")
	}
}

// ListForUser returns all achievements earned by a user.
// viewerID may be empty; it is used to enforce profile visibility and block checks.
func (s *AchievementService) ListForUser(ctx context.Context, userID, viewerID string) ([]*model.UserAchievement, error) {
	if s.social != nil && viewerID != userID {
		if err := s.social.CanViewProfile(ctx, userID, viewerID); err != nil {
			return nil, err
		}
	}
	items, err := s.achievements.ListForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list achievements: %w", err)
	}
	return items, nil
}

// ListDefs returns the full achievement catalog. The catalog is public so the
// frontend can render the locked/unlocked grid for any profile without
// leaking per-user data.
func (s *AchievementService) ListDefs(ctx context.Context) ([]*model.AchievementDef, error) {
	items, err := s.achievements.ListDefs(ctx)
	if err != nil {
		return nil, fmt.Errorf("list achievement defs: %w", err)
	}
	return items, nil
}

