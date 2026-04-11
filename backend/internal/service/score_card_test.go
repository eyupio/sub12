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
	lastTotal    int16
	lastXCount   int16
}

func (m *mockScoreCardRepo) Create(_ context.Context, _ string, _ *model.CreateScoreCardInput, total, xCount int16) (*model.ScoreCard, error) {
	m.createCalled = true
	m.lastTotal = total
	m.lastXCount = xCount
	return &model.ScoreCard{ID: "test-id", TotalScore: total, XCount: xCount, Verification: "pending"}, nil
}
func (m *mockScoreCardRepo) GetByID(_ context.Context, _, _ string) (*model.ScoreCard, error) {
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) ListByUser(_ context.Context, _ string, _, _ int) ([]*model.ScoreCardSummary, error) {
	return nil, nil
}
func (m *mockScoreCardRepo) UpdateImageURL(_ context.Context, _, _ string) error { return nil }
func (m *mockScoreCardRepo) Update(_ context.Context, _, _ string, _ *model.UpdateScoreCardInput, total, xCount int16) (*model.ScoreCard, error) {
	m.updateCalled = true
	m.lastTotal = total
	m.lastXCount = xCount
	return &model.ScoreCard{ID: "test-id", TotalScore: total, XCount: xCount, Verification: "pending"}, nil
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
