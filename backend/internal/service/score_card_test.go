package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// mockScoreCardRepo is a minimal stub that lets us test service-level
// validation without hitting the database.
type mockScoreCardRepo struct {
	createCalled bool
	updateCalled bool
	deleteCalled bool
	lastTotal    int16
	lastXCount   int16
	// card is returned from GetByID; if nil, a placeholder is returned.
	card *model.ScoreCard
}

func (m *mockScoreCardRepo) Create(_ context.Context, _ string, _ *model.CreateScoreCardInput, total, xCount int16) (*model.ScoreCard, error) {
	m.createCalled = true
	m.lastTotal = total
	m.lastXCount = xCount
	return &model.ScoreCard{ID: "test-id", TotalScore: total, XCount: xCount, Verification: "verified"}, nil
}
func (m *mockScoreCardRepo) GetByID(_ context.Context, _, _ string) (*model.ScoreCard, error) {
	if m.card != nil {
		return m.card, nil
	}
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) GetPublicByID(_ context.Context, _ string) (*model.ScoreCard, error) {
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) ListByUser(_ context.Context, _ string, _, _ int, _ string, _ string) ([]*model.ScoreCardSummary, error) {
	return nil, nil
}
func (m *mockScoreCardRepo) UpdateImageURL(_ context.Context, _, _ string) error { return nil }
func (m *mockScoreCardRepo) Update(_ context.Context, _, _ string, _ *model.UpdateScoreCardInput, total, xCount int16) (*model.ScoreCard, error) {
	m.updateCalled = true
	m.lastTotal = total
	m.lastXCount = xCount
	return &model.ScoreCard{ID: "test-id", TotalScore: total, XCount: xCount, Verification: "pending"}, nil
}
func (m *mockScoreCardRepo) Delete(_ context.Context, _, _ string) error {
	m.deleteCalled = true
	return nil
}
func (m *mockScoreCardRepo) IsPersonalBest(_ context.Context, _, _ string, _ int16) (bool, error) {
	return false, nil
}

// mockLeagueRepo implements LeagueConfigRepo for lock-policy tests.
type mockLeagueRepo struct {
	cfg      *model.LeagueConfig
	isMember bool
}

func (m *mockLeagueRepo) GetConfigByRoundID(_ context.Context, _ string) (*model.LeagueConfig, error) {
	return m.cfg, nil
}
func (m *mockLeagueRepo) CountUserSubmissionsForRound(_ context.Context, _, _ string) (int, error) {
	return 0, nil
}
func (m *mockLeagueRepo) GetLeagueIDByRoundID(_ context.Context, _ string) (string, error) {
	return "league-1", nil
}
func (m *mockLeagueRepo) GetByID(_ context.Context, _ string) (*model.League, error) {
	return nil, nil
}
func (m *mockLeagueRepo) IsMember(_ context.Context, _, _ string) (bool, error) {
	return m.isMember, nil
}

func newTestService(repo *mockScoreCardRepo) *ScoreCardService {
	return &ScoreCardService{cards: repo}
}

// --- Create tests ---

func TestCreate_ValidInput(t *testing.T) {
	repo := &mockScoreCardRepo{}
	svc := newTestService(repo)

	scores := make([]int16, 25)
	xs := make([]bool, 25)
	for i := range 25 {
		scores[i] = 8
	}
	scores[0] = 10
	xs[0] = true

	card, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: scores,
		ShotXs:     xs,
	})

	require.NoError(t, err)
	assert.True(t, repo.createCalled)
	assert.Equal(t, int16(202), card.TotalScore) // 10 + 24*8
	assert.Equal(t, int16(1), card.XCount)
}

func TestCreate_WrongShotCount(t *testing.T) {
	svc := newTestService(&mockScoreCardRepo{})

	_, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: make([]int16, 10), // wrong count
		ShotXs:     make([]bool, 10),
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
}

func TestCreate_ScoreOutOfRange(t *testing.T) {
	svc := newTestService(&mockScoreCardRepo{})

	scores := make([]int16, 25)
	scores[5] = 11 // out of range

	_, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: scores,
		ShotXs:     make([]bool, 25),
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.Contains(t, err.Error(), "shot 6")
}

func TestCreate_MissingShotAt(t *testing.T) {
	svc := newTestService(&mockScoreCardRepo{})

	_, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotScores: make([]int16, 25),
		ShotXs:     make([]bool, 25),
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
}

// --- Update tests ---

func TestUpdate_ValidInput(t *testing.T) {
	repo := &mockScoreCardRepo{}
	svc := newTestService(repo)

	scores := make([]int16, 25)
	xs := make([]bool, 25)
	for i := range 25 {
		scores[i] = 10
		xs[i] = true
	}

	card, err := svc.Update(context.Background(), "card1", "user1", &model.UpdateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: scores,
		ShotXs:     xs,
	})

	require.NoError(t, err)
	assert.True(t, repo.updateCalled)
	assert.Equal(t, int16(250), card.TotalScore)
	assert.Equal(t, int16(25), card.XCount)
}

func TestUpdate_InvalidShotCount(t *testing.T) {
	svc := newTestService(&mockScoreCardRepo{})

	_, err := svc.Update(context.Background(), "card1", "user1", &model.UpdateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: make([]int16, 20),
		ShotXs:     make([]bool, 20),
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
}

func TestUpdate_NegativeScore(t *testing.T) {
	svc := newTestService(&mockScoreCardRepo{})

	scores := make([]int16, 25)
	scores[0] = -1

	_, err := svc.Update(context.Background(), "card1", "user1", &model.UpdateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: scores,
		ShotXs:     make([]bool, 25),
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
}

// --- Delete tests ---

func TestDelete_Personal(t *testing.T) {
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{ID: "card1", Verification: "verified"},
	}
	svc := newTestService(repo)

	err := svc.Delete(context.Background(), "card1", "user1")
	require.NoError(t, err)
	assert.True(t, repo.deleteCalled)
}

func TestDelete_LockedLeagueCard(t *testing.T) {
	roundID := "round-1"
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID:            "card1",
			Verification:  "verified",
			LeagueRoundID: &roundID,
		},
	}
	svc := &ScoreCardService{
		cards: repo,
		leagueRepo: &mockLeagueRepo{cfg: &model.LeagueConfig{
			LockEditsAfterVerification: true,
		}},
	}

	err := svc.Delete(context.Background(), "card1", "user1")
	assert.ErrorIs(t, err, ErrEditsLocked)
	assert.False(t, repo.deleteCalled)
}

func TestDelete_UnverifiedLeagueCardNotLocked(t *testing.T) {
	roundID := "round-1"
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID:            "card1",
			Verification:  "pending",
			LeagueRoundID: &roundID,
		},
	}
	svc := &ScoreCardService{
		cards: repo,
		leagueRepo: &mockLeagueRepo{cfg: &model.LeagueConfig{
			LockEditsAfterVerification: true,
		}},
	}

	err := svc.Delete(context.Background(), "card1", "user1")
	require.NoError(t, err)
	assert.True(t, repo.deleteCalled)
}

func TestUpdate_LockedLeagueCard(t *testing.T) {
	roundID := "round-1"
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID:            "card1",
			Verification:  "verified",
			LeagueRoundID: &roundID,
		},
	}
	svc := &ScoreCardService{
		cards: repo,
		leagueRepo: &mockLeagueRepo{cfg: &model.LeagueConfig{
			LockEditsAfterVerification: true,
		}},
	}

	scores := make([]int16, 25)
	xs := make([]bool, 25)
	_, err := svc.Update(context.Background(), "card1", "user1", &model.UpdateScoreCardInput{
		ShotAt:     "2025-01-01",
		ShotScores: scores,
		ShotXs:     xs,
	})
	assert.ErrorIs(t, err, ErrEditsLocked)
	assert.False(t, repo.updateCalled)
}

// --- League membership tests ---

func TestCreate_LeagueSubmission_RequiresMembership(t *testing.T) {
	repo := &mockScoreCardRepo{}
	roundID := "round-1"
	svc := &ScoreCardService{
		cards:      repo,
		leagueRepo: &mockLeagueRepo{isMember: false},
	}

	scores := make([]int16, 25)
	xs := make([]bool, 25)

	_, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotAt:        "2025-01-01",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	})
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.Contains(t, err.Error(), "not a member")
	assert.False(t, repo.createCalled)
}

func TestCreate_LeagueSubmission_MemberSucceeds(t *testing.T) {
	repo := &mockScoreCardRepo{}
	roundID := "round-1"
	svc := &ScoreCardService{
		cards:      repo,
		leagueRepo: &mockLeagueRepo{isMember: true},
	}

	scores := make([]int16, 25)
	xs := make([]bool, 25)

	_, err := svc.Create(context.Background(), "user1", &model.CreateScoreCardInput{
		ShotAt:        "2025-01-01",
		ShotScores:    scores,
		ShotXs:        xs,
		LeagueRoundID: &roundID,
	})
	require.NoError(t, err)
	assert.True(t, repo.createCalled)
}
