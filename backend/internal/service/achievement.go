package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// Scoring constants for EvaluateForScoreCard.
// These reflect the rules for a standard 10m Air Pistol / 25m Precision Pistol
// card: 50 shots fired at a 10-point ring target, giving a maximum total score
// of 250. The X-ring is a smaller inner zone inside the 10-ring; hitting it
// scores the same 10 points but is tracked separately as a precision metric.
const (
	maxScorePerCard = 250 // 50 shots × 10-point maximum ring

	// Score-based achievement thresholds.
	scoreCentury       = 100             // ~40 % of max; approachable entry milestone
	scoreDoubleCentury = 200             // ~80 % of max; accomplished shooter
	scorePerfect       = maxScorePerCard // every shot placed in the 10-ring

	// X-ring hit thresholds (inner bull within the 10-ring).
	xCountSharpEye     = 5  // entry tier — consistent inner-ring accuracy
	xCountSharpshooter = 10 // second tier
	xCountXMachine     = 15 // top tier — majority of shots land in the X-ring
)

type AchievementRepo interface {
	Award(ctx context.Context, userID, achievementID string) (bool, error)
	ListForUser(ctx context.Context, userID string) ([]*model.UserAchievement, error)
	GetDef(ctx context.Context, id string) (*model.AchievementDef, error)
	ListDefs(ctx context.Context) ([]*model.AchievementDef, error)
}

type CardCountRepo interface {
	GetCardCount(ctx context.Context, userID string) (int, error)
	GetLeagueCardCount(ctx context.Context, userID string) (int, error)
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

// LikeCountRepo exposes like counts for achievement evaluation.
type LikeCountRepo interface {
	CountGivenByUser(ctx context.Context, userID string) (int, error)
	CountReceivedByOwner(ctx context.Context, userID string) (int, error)
}

// CommunityReviewCountRepo exposes the per-user count of confirmations given
// against community review requests, used to gate reviewer achievements.
type CommunityReviewCountRepo interface {
	CountConfirmationsByUser(ctx context.Context, userID string) (int, error)
}

// EventCountRepo exposes lifetime counts used by Live Events achievements:
// hosted = events the user owned to completion; completed = events the user
// participated in (registered, not guest) that reached completion.
type EventCountRepo interface {
	CountHostedByUser(ctx context.Context, userID string) (int, error)
	CountCompletedByUser(ctx context.Context, userID string) (int, error)
}

// StarLevelRepo updates a user's computed star_level.
type StarLevelRepo interface {
	UpdateStarLevel(ctx context.Context, userID string) error
}

type AchievementService struct {
	achievements    AchievementRepo
	cards           CardCountRepo
	follows         FollowCountRepo
	comments        CommentCountRepo
	clubs           ClubMembershipCountRepo
	pelletTests     PelletTestCountRepo
	likes           LikeCountRepo
	communityReview CommunityReviewCountRepo
	events          EventCountRepo
	starLevel       StarLevelRepo
	activity        *ActivityService // nil disables feed ingestion
	social          *SocialService   // nil disables privacy enforcement
}

func NewAchievementService(
	achievements AchievementRepo,
	cards CardCountRepo,
	follows FollowCountRepo,
	comments CommentCountRepo,
	clubs ClubMembershipCountRepo,
	pelletTests PelletTestCountRepo,
	likes LikeCountRepo,
	communityReview CommunityReviewCountRepo,
	starLevel StarLevelRepo,
	activity *ActivityService,
) *AchievementService {
	return &AchievementService{
		achievements:    achievements,
		cards:           cards,
		follows:         follows,
		comments:        comments,
		clubs:           clubs,
		pelletTests:     pelletTests,
		likes:           likes,
		communityReview: communityReview,
		starLevel:       starLevel,
		activity:        activity,
	}
}

// SetEventCounts wires the event-count repo. Done post-construction so
// AchievementService doesn't need to know about EventRepository at build time.
func (s *AchievementService) SetEventCounts(events EventCountRepo) {
	s.events = events
}

// SetSocial wires the social service used for profile-visibility enforcement.
// Called after construction to avoid a circular dependency with SocialService.
func (s *AchievementService) SetSocial(social *SocialService) {
	s.social = social
}

// award grants an achievement and, when newly awarded, publishes a feed event
// populated with the def's name/icon/description so feed consumers can render
// without a second lookup. Also refreshes the user's star_level.
func (s *AchievementService) award(ctx context.Context, userID, achievementID string) {
	awarded, err := s.achievements.Award(ctx, userID, achievementID)
	if err != nil || !awarded {
		return
	}
	// Refresh star_level whenever a new achievement is granted.
	if s.starLevel != nil {
		_ = s.starLevel.UpdateStarLevel(ctx, userID)
	}
	if s.activity == nil {
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
	if card.TotalScore >= scoreCentury {
		s.award(ctx, userID, "century")
	}
	if card.TotalScore >= scoreDoubleCentury {
		s.award(ctx, userID, "double_century")
	}
	if card.TotalScore == scorePerfect {
		s.award(ctx, userID, "perfect_score")
	}
	if card.XCount >= xCountSharpEye {
		s.award(ctx, userID, "sharp_eye")
	}
	if card.XCount >= xCountSharpshooter {
		s.award(ctx, userID, "sharpshooter")
	}
	if card.XCount >= xCountXMachine {
		s.award(ctx, userID, "x_machine")
	}
	if cardCount >= 10 {
		s.award(ctx, userID, "dedicated")
	}
	if cardCount >= 25 {
		s.award(ctx, userID, "top_shooter")
	}
	if cardCount >= 50 {
		s.award(ctx, userID, "range_regular")
	}
	if cardCount >= 100 {
		s.award(ctx, userID, "century_club")
	}
	if card.LeagueRoundID != nil {
		s.award(ctx, userID, "league_debut")
		if s.cards != nil {
			leagueCount, err := s.cards.GetLeagueCardCount(ctx, userID)
			if err == nil && leagueCount >= 5 {
				s.award(ctx, userID, "league_veteran")
			}
			if err == nil && leagueCount >= 10 {
				s.award(ctx, userID, "league_regular")
			}
		}
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
//   - well_known to the target when they cross 25 followers
func (s *AchievementService) EvaluateForFollow(ctx context.Context, followerID, followedID string) {
	if s.follows == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if count, err := s.follows.CountFollowing(ctx, followerID); err == nil && count == 1 {
		s.award(ctx, followerID, "first_follow")
	}
	// Both follower-count thresholds share one DB call so the tiers are evaluated
	// against the same snapshot and never disagree mid-function.
	if followers, err := s.follows.CountFollowers(ctx, followedID); err == nil {
		if followers >= 10 {
			s.award(ctx, followedID, "social_butterfly")
		}
		if followers >= 25 {
			s.award(ctx, followedID, "well_known")
		}
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
	if count >= 25 {
		s.award(ctx, userID, "discussion_leader")
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

// EvaluateForPelletTest awards pellet_scientist on the user's first pellet-test session
// and pellet_expert at 5 sessions.
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
	if count >= 5 {
		s.award(ctx, userID, "pellet_expert")
	}
	if count >= 10 {
		s.award(ctx, userID, "pellet_master")
	}
}

// EvaluateForLikeGiven awards super_liker when the user has given 25 likes.
func (s *AchievementService) EvaluateForLikeGiven(ctx context.Context, likerID string) {
	if s.likes == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.likes.CountGivenByUser(ctx, likerID)
	if err != nil {
		return
	}
	if count >= 25 {
		s.award(ctx, likerID, "super_liker")
	}
	if count >= 50 {
		s.award(ctx, likerID, "tastemaker")
	}
}

// EvaluateForLikeReceived awards fan_favourite (10 likes) and community_champion
// (25 likes) to the owner of the liked content.
func (s *AchievementService) EvaluateForLikeReceived(ctx context.Context, ownerID string) {
	if s.likes == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.likes.CountReceivedByOwner(ctx, ownerID)
	if err != nil {
		return
	}
	if count >= 10 {
		s.award(ctx, ownerID, "fan_favourite")
	}
	if count >= 25 {
		s.award(ctx, ownerID, "community_champion")
	}
	if count >= 50 {
		s.award(ctx, ownerID, "in_the_spotlight")
	}
}

// EvaluateForCommunityReview awards reviewer achievements after a user
// confirms a community review request. Tiered (1/10/25) and a "fast
// responder" tier when the confirmation lands within 24h of the request.
func (s *AchievementService) EvaluateForCommunityReview(ctx context.Context, reviewerID string, requestCreatedAt time.Time) {
	if s.communityReview == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	count, err := s.communityReview.CountConfirmationsByUser(ctx, reviewerID)
	if err != nil {
		return
	}
	if count >= 1 {
		s.award(ctx, reviewerID, "first_review")
	}
	if count >= 10 {
		s.award(ctx, reviewerID, "community_reviewer")
	}
	if count >= 25 {
		s.award(ctx, reviewerID, "peer_judge")
	}
	if !requestCreatedAt.IsZero() && time.Since(requestCreatedAt) <= 24*time.Hour {
		s.award(ctx, reviewerID, "helpful_reviewer")
	}
}

// EvaluateForEventCompletion runs the Live Events achievement rules after an
// event reaches the 'complete' state. Awards:
//   - event_first_join: every registered participant whose lifetime completed
//     count is now 1.
//   - event_veteran_{10,25,50}: registered participants who cross those tiers.
//   - event_clean_card: registered participants who recorded at least one shot
//     and whose hits == shots_recorded (i.e. 100% hits).
//   - event_podium: top 3 by points (across all categories) for registered
//     participants only.
//   - event_host_{1,5,25}: the owner crossing those lifetime tiers.
//
// Guests never receive achievements (they have no account).
func (s *AchievementService) EvaluateForEventCompletion(ctx context.Context, ev *model.Event, standings []*model.EventStandingRow) {
	if s == nil || s.events == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Per-participant rules
	for _, row := range standings {
		if row.UserID == nil {
			continue
		}
		uid := *row.UserID
		if row.ShotsRecorded > 0 && row.HitCount == row.ShotsRecorded {
			s.award(ctx, uid, "event_clean_card")
		}
		if row.Position >= 1 && row.Position <= 3 && row.ShotsRecorded > 0 {
			s.award(ctx, uid, "event_podium")
		}
		count, err := s.events.CountCompletedByUser(ctx, uid)
		if err == nil {
			if count >= 1 {
				s.award(ctx, uid, "event_first_join")
			}
			if count >= 10 {
				s.award(ctx, uid, "event_veteran_10")
			}
			if count >= 25 {
				s.award(ctx, uid, "event_veteran_25")
			}
			if count >= 50 {
				s.award(ctx, uid, "event_veteran_50")
			}
		}
	}

	// Host tiers
	if ev != nil {
		if hosted, err := s.events.CountHostedByUser(ctx, ev.OwnerUserID); err == nil {
			if hosted >= 1 {
				s.award(ctx, ev.OwnerUserID, "event_host_1")
			}
			if hosted >= 5 {
				s.award(ctx, ev.OwnerUserID, "event_host_5")
			}
			if hosted >= 25 {
				s.award(ctx, ev.OwnerUserID, "event_host_25")
			}
		}
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
