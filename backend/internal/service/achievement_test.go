package service

import (
	"context"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/require"
)

type achievementRepoStub struct {
	awarded []string
}

func (s *achievementRepoStub) Award(_ context.Context, _ string, achievementID string) (bool, error) {
	s.awarded = append(s.awarded, achievementID)
	return true, nil
}

func (s *achievementRepoStub) ListForUser(context.Context, string) ([]*model.UserAchievement, error) {
	return nil, nil
}

func (s *achievementRepoStub) GetDef(context.Context, string) (*model.AchievementDef, error) {
	return nil, nil
}

func (s *achievementRepoStub) ListDefs(context.Context) ([]*model.AchievementDef, error) {
	return nil, nil
}

type cardCountRepoStub struct {
	cardCount   int
	leagueCount int
}

func (s cardCountRepoStub) GetCardCount(context.Context, string) (int, error) {
	return s.cardCount, nil
}

func (s cardCountRepoStub) GetLeagueCardCount(context.Context, string) (int, error) {
	return s.leagueCount, nil
}

type followCountRepoStub struct {
	following int
	followers int
}

func (s followCountRepoStub) CountFollowing(context.Context, string) (int, error) {
	return s.following, nil
}

func (s followCountRepoStub) CountFollowers(context.Context, string) (int, error) {
	return s.followers, nil
}

type commentCountRepoStub struct {
	count int
}

func (s commentCountRepoStub) CountByUser(context.Context, string) (int, error) {
	return s.count, nil
}

type pelletTestCountRepoStub struct {
	count int
}

func (s pelletTestCountRepoStub) CountByUser(context.Context, string) (int, error) {
	return s.count, nil
}

type likeCountRepoStub struct {
	given    int
	received int
}

func (s likeCountRepoStub) CountGivenByUser(context.Context, string) (int, error) {
	return s.given, nil
}

func (s likeCountRepoStub) CountReceivedByOwner(context.Context, string) (int, error) {
	return s.received, nil
}

func TestAchievementServiceEvaluateForScoreCardAwardsExpandedMilestones(t *testing.T) {
	repo := &achievementRepoStub{}
	service := &AchievementService{
		achievements: repo,
		cards: cardCountRepoStub{
			cardCount:   100,
			leagueCount: 10,
		},
	}
	leagueRoundID := "round-1"

	service.EvaluateForScoreCard(context.Background(), "user-1", &model.ScoreCard{
		TotalScore:    205,
		XCount:        15,
		LeagueRoundID: &leagueRoundID,
	})

	require.Subset(t, repo.awarded, []string{
		"double_century",
		"x_machine",
		"range_regular",
		"century_club",
		"league_regular",
	})
}

func TestAchievementServiceEvaluateForCommunityMilestonesAwardsExpandedThresholds(t *testing.T) {
	t.Run("follow milestone", func(t *testing.T) {
		repo := &achievementRepoStub{}
		service := &AchievementService{achievements: repo, follows: followCountRepoStub{following: 3, followers: 25}}

		service.EvaluateForFollow(context.Background(), "follower-1", "user-1")

		require.Contains(t, repo.awarded, "well_known")
	})

	t.Run("comment milestone", func(t *testing.T) {
		repo := &achievementRepoStub{}
		service := &AchievementService{achievements: repo, comments: commentCountRepoStub{count: 25}}

		service.EvaluateForComment(context.Background(), "user-1")

		require.Contains(t, repo.awarded, "discussion_leader")
	})

	t.Run("pellet test milestone", func(t *testing.T) {
		repo := &achievementRepoStub{}
		service := &AchievementService{achievements: repo, pelletTests: pelletTestCountRepoStub{count: 10}}

		service.EvaluateForPelletTest(context.Background(), "user-1")

		require.Contains(t, repo.awarded, "pellet_master")
	})

	t.Run("likes given milestone", func(t *testing.T) {
		repo := &achievementRepoStub{}
		service := &AchievementService{achievements: repo, likes: likeCountRepoStub{given: 50}}

		service.EvaluateForLikeGiven(context.Background(), "user-1")

		require.Contains(t, repo.awarded, "tastemaker")
	})

	t.Run("likes received milestone", func(t *testing.T) {
		repo := &achievementRepoStub{}
		service := &AchievementService{achievements: repo, likes: likeCountRepoStub{received: 50}}

		service.EvaluateForLikeReceived(context.Background(), "user-1")

		require.Contains(t, repo.awarded, "in_the_spotlight")
	})
}
