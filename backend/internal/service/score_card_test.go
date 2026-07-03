package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// mockScoreCardRepo is a minimal stub that lets us test service-level
// validation without hitting the database.
type mockScoreCardRepo struct {
	createCalled         bool
	createDraftCalled    bool
	graduateCalled       bool
	updateCalled         bool
	updateRotationCalled bool
	deleteCalled         bool
	lastTotal            int16
	lastXCount           int16
	lastRotation         int16
	submitToLeagueCalled bool
	// card is returned from GetByID; if nil, a placeholder is returned.
	card *model.ScoreCard
	// priorStats overrides the GetPriorScoreStats response when non-nil.
	priorStats *repository.PriorScoreStats
	// gearLabels overrides GetGearLabels when set; the activity ingest path
	// uses this to label posts with rifle/pellet names.
	rifleLabel  string
	pelletLabel string
}

func (m *mockScoreCardRepo) Create(_ context.Context, _ string, _ *model.CreateScoreCardInput, total, xCount int16, _ int) (*model.ScoreCard, error) {
	m.createCalled = true
	m.lastTotal = total
	m.lastXCount = xCount
	return &model.ScoreCard{ID: "test-id", TotalScore: total, XCount: xCount, Verification: "verified"}, nil
}
func (m *mockScoreCardRepo) CreateDraft(_ context.Context, _ string, _ *model.QuickCreateScoreCardInput) (*model.ScoreCard, error) {
	m.createDraftCalled = true
	return &model.ScoreCard{ID: "draft-id", IsDraft: true, Verification: "pending"}, nil
}
func (m *mockScoreCardRepo) Graduate(_ context.Context, _, _ string, _ *string, _ int) (*model.ScoreCard, error) {
	m.graduateCalled = true
	if m.card != nil {
		m.card.IsDraft = false
		return m.card, nil
	}
	return &model.ScoreCard{ID: "test-id", IsDraft: false, Verification: "verified"}, nil
}
func (m *mockScoreCardRepo) GetByID(_ context.Context, _, _ string) (*model.ScoreCard, error) {
	if m.card != nil {
		return m.card, nil
	}
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) GetPublicByID(_ context.Context, _ string) (*model.ScoreCard, error) {
	if m.card != nil {
		return m.card, nil
	}
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) ListByUser(_ context.Context, _ string, _, _ int, _ string, _ string) ([]*model.ScoreCardSummary, error) {
	return nil, nil
}
func (m *mockScoreCardRepo) GetDraftCount(_ context.Context, _ string) (int, error) { return 0, nil }
func (m *mockScoreCardRepo) UpdateImageURL(_ context.Context, _, _, _ string) error { return nil }
func (m *mockScoreCardRepo) UpdateImageRotation(_ context.Context, _, _ string, rotation int16) (*model.ScoreCard, error) {
	m.updateRotationCalled = true
	m.lastRotation = rotation
	return &model.ScoreCard{ID: "test-id", CardImageRotation: int(rotation)}, nil
}
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
func (m *mockScoreCardRepo) GetPriorScoreStats(_ context.Context, _, _ string) (*repository.PriorScoreStats, error) {
	if m.priorStats != nil {
		return m.priorStats, nil
	}
	return &repository.PriorScoreStats{}, nil
}
func (m *mockScoreCardRepo) GetGearLabels(_ context.Context, _ string) (string, string, error) {
	return m.rifleLabel, m.pelletLabel, nil
}
func (m *mockScoreCardRepo) SubmitToLeague(_ context.Context, _, _, _ string) (*model.ScoreCard, error) {
	m.submitToLeagueCalled = true
	if m.card != nil {
		return m.card, nil
	}
	return &model.ScoreCard{ID: "test-id"}, nil
}
func (m *mockScoreCardRepo) SetVerification(_ context.Context, _, _ string) error { return nil }
func (m *mockScoreCardRepo) GetExistingCardForParticipant(_ context.Context, _ string) (*model.ScoreCard, error) {
	return nil, repository.ErrNotFound
}

// mockLeagueRepo implements LeagueConfigRepo for lock-policy tests.
type mockLeagueRepo struct {
	cfg             *model.LeagueConfig
	isMember        bool
	submissionCount int
}

func (m *mockLeagueRepo) GetConfigByRoundID(_ context.Context, _ string) (*model.LeagueConfig, error) {
	return m.cfg, nil
}
func (m *mockLeagueRepo) CountUserSubmissionsForRound(_ context.Context, _, _ string) (int, error) {
	return m.submissionCount, nil
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

// --- Draft / quick-capture tests ---

// Quick-capture skips the 25-shot validation — that rule only applies at
// graduation, after the user has refined the shot grid.
func TestQuickCreate_SkipsShotValidation(t *testing.T) {
	repo := &mockScoreCardRepo{}
	svc := newTestService(repo)

	card, err := svc.QuickCreate(context.Background(), "user1", &model.QuickCreateScoreCardInput{})
	require.NoError(t, err)
	assert.True(t, repo.createDraftCalled)
	assert.True(t, card.IsDraft)
	assert.Equal(t, "pending", card.Verification)
}

// Graduate refuses to clear the draft flag when the shot grid hasn't been
// filled in — the user must PATCH the 25-shot payload first.
func TestGraduate_RequiresFullShotGrid(t *testing.T) {
	// Simulate a draft with empty shot arrays.
	repo := &mockScoreCardRepo{card: &model.ScoreCard{
		ID:           "draft-id",
		IsDraft:      true,
		ShotScores:   []int16{},
		ShotXs:       []bool{},
		Verification: "pending",
	}}
	svc := newTestService(repo)
	_, err := svc.Graduate(context.Background(), "draft-id", "user1")
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.False(t, repo.graduateCalled)
}

// Graduate flips the flag once the shot grid is full; verification stays
// pending for league submissions (round is set) and flips to verified for
// personal cards.
func TestGraduate_ClearsDraftOnCompleteCard(t *testing.T) {
	shots := make([]int16, 25)
	xs := make([]bool, 25)
	repo := &mockScoreCardRepo{card: &model.ScoreCard{
		ID:         "draft-id",
		IsDraft:    true,
		ShotScores: shots,
		ShotXs:     xs,
	}}
	svc := newTestService(repo)
	out, err := svc.Graduate(context.Background(), "draft-id", "user1")
	require.NoError(t, err)
	assert.True(t, repo.graduateCalled)
	assert.False(t, out.IsDraft)
}

// --- Rotate tests ---

func TestRotate_ValidAngles(t *testing.T) {
	for _, angle := range []int16{0, 90, 180, 270} {
		repo := &mockScoreCardRepo{}
		svc := newTestService(repo)

		card, err := svc.Rotate(context.Background(), "card1", "user1", angle)
		require.NoError(t, err)
		assert.True(t, repo.updateRotationCalled)
		assert.Equal(t, angle, repo.lastRotation)
		assert.Equal(t, int(angle), card.CardImageRotation)
	}
}

func TestRotate_InvalidAngle(t *testing.T) {
	for _, angle := range []int16{45, 360, -90, 91} {
		repo := &mockScoreCardRepo{}
		svc := newTestService(repo)

		_, err := svc.Rotate(context.Background(), "card1", "user1", angle)
		assert.ErrorIs(t, err, ErrInvalidCard)
		assert.False(t, repo.updateRotationCalled, "repo should not be called for angle %d", angle)
	}
}

// Rotation is a cosmetic display setting that should bypass the
// lock-edits-after-verification policy applied to score-changing edits.
func TestRotate_IgnoresLockPolicy(t *testing.T) {
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

	_, err := svc.Rotate(context.Background(), "card1", "user1", 90)
	require.NoError(t, err)
	assert.True(t, repo.updateRotationCalled)
	assert.Equal(t, int16(90), repo.lastRotation)
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
	assert.ErrorIs(t, err, ErrNotLeagueMember)
	assert.False(t, repo.createCalled)
}

// --- GetForViewerWithAuthor: PB / running_avg derivation ---

func TestGetForViewerWithAuthor_NoPriorScores_NoPBNoRunningAvg(t *testing.T) {
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID: "card-1", UserID: "owner", TotalScore: 200, Visibility: "public",
		},
		priorStats: &repository.PriorScoreStats{Count: 0},
	}
	svc := &ScoreCardService{cards: repo}

	out, err := svc.GetForViewerWithAuthor(context.Background(), "card-1", "owner")
	require.NoError(t, err)
	assert.False(t, out.IsPB)
	assert.Nil(t, out.PBDelta)
	assert.Nil(t, out.RunningAvg)
}

func TestGetForViewerWithAuthor_NewBest_FlagsPBAndDelta(t *testing.T) {
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID: "card-1", UserID: "owner", TotalScore: 233, Visibility: "public",
		},
		priorStats: &repository.PriorScoreStats{Count: 5, PreviousMax: 229, Mean: 220.6},
	}
	svc := &ScoreCardService{cards: repo}

	out, err := svc.GetForViewerWithAuthor(context.Background(), "card-1", "owner")
	require.NoError(t, err)
	assert.True(t, out.IsPB)
	require.NotNil(t, out.PBDelta)
	assert.Equal(t, int16(4), *out.PBDelta)
	require.NotNil(t, out.RunningAvg)
	assert.InDelta(t, 220.6, *out.RunningAvg, 0.01)
}

func TestGetForViewerWithAuthor_NotABest_NoPBButRunningAvg(t *testing.T) {
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID: "card-1", UserID: "owner", TotalScore: 215, Visibility: "public",
		},
		priorStats: &repository.PriorScoreStats{Count: 5, PreviousMax: 229, Mean: 220.6},
	}
	svc := &ScoreCardService{cards: repo}

	out, err := svc.GetForViewerWithAuthor(context.Background(), "card-1", "owner")
	require.NoError(t, err)
	assert.False(t, out.IsPB)
	assert.Nil(t, out.PBDelta)
	require.NotNil(t, out.RunningAvg)
	assert.InDelta(t, 220.6, *out.RunningAvg, 0.01)
}

func TestGetForViewerWithAuthor_TieIsNotPB(t *testing.T) {
	repo := &mockScoreCardRepo{
		card: &model.ScoreCard{
			ID: "card-1", UserID: "owner", TotalScore: 229, Visibility: "public",
		},
		priorStats: &repository.PriorScoreStats{Count: 1, PreviousMax: 229, Mean: 229},
	}
	svc := &ScoreCardService{cards: repo}

	out, err := svc.GetForViewerWithAuthor(context.Background(), "card-1", "owner")
	require.NoError(t, err)
	assert.False(t, out.IsPB)
	assert.Nil(t, out.PBDelta)
	require.NotNil(t, out.RunningAvg)
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

// --- SubmitToLeague tests ---
// SubmitToLeague is a parallel submission path that re-enforces the same
// business rules as Create (membership, max submissions, image required) plus
// two guards unique to the post-hoc path (no drafts, no double-submission).
// These tests pin each rule independently so a refactor that removes any one
// guard will surface immediately.

func TestSubmitToLeague_DraftCardRejected(t *testing.T) {
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "draft-1", IsDraft: true}}
	svc := &ScoreCardService{cards: repo, leagueRepo: &mockLeagueRepo{isMember: true}}

	_, err := svc.SubmitToLeague(context.Background(), "draft-1", "user1", "round-1")
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.False(t, repo.submitToLeagueCalled)
}

func TestSubmitToLeague_AlreadySubmittedRejected(t *testing.T) {
	existing := "round-1"
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "card-1", IsDraft: false, LeagueRoundID: &existing}}
	svc := &ScoreCardService{cards: repo, leagueRepo: &mockLeagueRepo{isMember: true}}

	_, err := svc.SubmitToLeague(context.Background(), "card-1", "user1", "round-2")
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.False(t, repo.submitToLeagueCalled)
}

func TestSubmitToLeague_RequiresMembership(t *testing.T) {
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "card-1", IsDraft: false}}
	svc := &ScoreCardService{cards: repo, leagueRepo: &mockLeagueRepo{isMember: false}}

	_, err := svc.SubmitToLeague(context.Background(), "card-1", "user1", "round-1")
	assert.ErrorIs(t, err, ErrNotLeagueMember)
	assert.False(t, repo.submitToLeagueCalled)
}

func TestSubmitToLeague_MaxSubmissionsEnforced(t *testing.T) {
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "card-1", IsDraft: false}}
	svc := &ScoreCardService{
		cards: repo,
		leagueRepo: &mockLeagueRepo{
			isMember:        true,
			submissionCount: 2,
			cfg:             &model.LeagueConfig{MaxSubmissionsPerRound: 2},
		},
	}

	_, err := svc.SubmitToLeague(context.Background(), "card-1", "user1", "round-1")
	assert.ErrorIs(t, err, ErrMaxSubmissions)
	assert.False(t, repo.submitToLeagueCalled)
}

func TestSubmitToLeague_ImageRequiredNoImageRejected(t *testing.T) {
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "card-1", IsDraft: false}}
	svc := &ScoreCardService{
		cards:      repo,
		leagueRepo: &mockLeagueRepo{isMember: true, cfg: &model.LeagueConfig{RequireImageUpload: true}},
	}

	_, err := svc.SubmitToLeague(context.Background(), "card-1", "user1", "round-1")
	assert.ErrorIs(t, err, ErrInvalidCard)
	assert.False(t, repo.submitToLeagueCalled)
}

func TestSubmitToLeague_MemberWithImageSucceeds(t *testing.T) {
	url := "https://example.com/card.jpg"
	repo := &mockScoreCardRepo{card: &model.ScoreCard{ID: "card-1", IsDraft: false, CardImageURL: &url}}
	svc := &ScoreCardService{
		cards: repo,
		leagueRepo: &mockLeagueRepo{
			isMember: true,
			cfg:      &model.LeagueConfig{MaxSubmissionsPerRound: 3, RequireImageUpload: true},
		},
	}

	_, err := svc.SubmitToLeague(context.Background(), "card-1", "user1", "round-1")
	require.NoError(t, err)
	assert.True(t, repo.submitToLeagueCalled)
}

// mockUserReader implements UserProfileReader for GetForViewer privacy tests.
type mockUserReader struct{ profileVisibility string }

func (m *mockUserReader) GetByID(_ context.Context, _ string) (*model.User, error) {
	return &model.User{ProfileVisibility: m.profileVisibility}, nil
}

// GetForViewer is the authorization gate comments and shares route through to
// stop strangers reading non-public cards (see the audit fix that closed the
// followers-visibility leak). These pin down every branch of that gate.
func TestGetForViewer_NonOwnerAccess(t *testing.T) {
	tests := []struct {
		name       string
		card       *model.ScoreCard
		viewerID   string
		users      UserProfileReader
		wantDenied bool
	}{
		{"owner sees own private draft", &model.ScoreCard{UserID: "owner", IsDraft: true, Visibility: "private"}, "owner", nil, false},
		{"stranger denied on private card", &model.ScoreCard{UserID: "owner", Visibility: "private"}, "stranger", nil, true},
		{"stranger denied on followers-only card", &model.ScoreCard{UserID: "owner", Visibility: "followers"}, "stranger", nil, true},
		{"stranger denied on public draft", &model.ScoreCard{UserID: "owner", IsDraft: true, Visibility: "public"}, "stranger", nil, true},
		{"anonymous denied on private card", &model.ScoreCard{UserID: "owner", Visibility: "private"}, "", nil, true},
		{"stranger allowed on public card, public profile", &model.ScoreCard{UserID: "owner", Visibility: "public"}, "stranger", &mockUserReader{profileVisibility: "public"}, false},
		{"stranger denied on public card, private profile", &model.ScoreCard{UserID: "owner", Visibility: "public"}, "stranger", &mockUserReader{profileVisibility: "private"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &ScoreCardService{cards: &mockScoreCardRepo{card: tt.card}, users: tt.users}
			_, err := svc.GetForViewer(context.Background(), "card-1", tt.viewerID)
			if tt.wantDenied {
				assert.ErrorIs(t, err, repository.ErrNotFound)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
