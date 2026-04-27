package service

import (
	"context"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/require"
)

// eventCountRepoStub satisfies EventCountRepo so AchievementService can be
// driven through EvaluateForEventCompletion without a real database.
type eventCountRepoStub struct {
	hosted    int
	completed int
}

func (s eventCountRepoStub) CountHostedByUser(context.Context, string) (int, error) {
	return s.hosted, nil
}
func (s eventCountRepoStub) CountCompletedByUser(context.Context, string) (int, error) {
	return s.completed, nil
}

func TestEvaluateForEventCompletionAwardsParticipantTiers(t *testing.T) {
	repo := &achievementRepoStub{}
	svc := &AchievementService{
		achievements: repo,
		events:       eventCountRepoStub{hosted: 1, completed: 25},
	}
	uid := "user-1"
	standings := []*model.EventStandingRow{
		{ParticipantID: "p1", UserID: &uid, Position: 1, Points: 25, HitCount: 25, ShotsRecorded: 25},
	}
	ev := &model.Event{ID: "e1", OwnerUserID: "host-1", Name: "Spring HFT"}
	svc.EvaluateForEventCompletion(context.Background(), ev, standings)

	require.Subset(t, repo.awarded, []string{
		"event_clean_card",   // 25/25 hits
		"event_podium",       // position 1
		"event_first_join",   // completed >= 1
		"event_veteran_10",   // completed >= 10
		"event_veteran_25",   // completed >= 25
		"event_host_1",       // hosted >= 1
	})
}

func TestEvaluateForEventCompletionSkipsGuests(t *testing.T) {
	repo := &achievementRepoStub{}
	svc := &AchievementService{
		achievements: repo,
		events:       eventCountRepoStub{hosted: 5, completed: 0},
	}
	standings := []*model.EventStandingRow{
		// guest row: UserID nil, full sweep, top finish — should NOT earn anything.
		{ParticipantID: "p1", UserID: nil, DisplayName: "Guest", Position: 1, Points: 25, HitCount: 25, ShotsRecorded: 25},
	}
	ev := &model.Event{ID: "e1", OwnerUserID: "host-1", Name: "Open Event"}
	svc.EvaluateForEventCompletion(context.Background(), ev, standings)

	for _, a := range repo.awarded {
		require.NotContains(t, []string{"event_clean_card", "event_podium", "event_first_join"}, a,
			"guests must not earn participant achievements")
	}
	// Host tier should still fire for the owner.
	require.Contains(t, repo.awarded, "event_host_1")
	require.Contains(t, repo.awarded, "event_host_5")
}

func TestEvaluateForEventCompletionHonoursZeroShotsForPodium(t *testing.T) {
	// A registered "participant" who didn't shoot any rounds should not be
	// counted as podium even at position 1.
	repo := &achievementRepoStub{}
	svc := &AchievementService{
		achievements: repo,
		events:       eventCountRepoStub{},
	}
	uid := "user-1"
	standings := []*model.EventStandingRow{
		{ParticipantID: "p1", UserID: &uid, Position: 1, Points: 0, HitCount: 0, ShotsRecorded: 0},
	}
	svc.EvaluateForEventCompletion(context.Background(), &model.Event{}, standings)
	require.NotContains(t, repo.awarded, "event_podium")
	require.NotContains(t, repo.awarded, "event_clean_card")
}
