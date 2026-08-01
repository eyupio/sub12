package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type mockReviewRepo struct {
	req            *model.CommunityReviewRequest
	createErr      error
	created        bool
	markVerified   bool
	markVerifiedOK bool
	cancelled      bool
}

func (m *mockReviewRepo) Create(_ context.Context, scoreCardID, requestedBy string, required int16) (*model.CommunityReviewRequest, error) {
	if m.createErr != nil {
		return nil, m.createErr
	}
	m.created = true
	return &model.CommunityReviewRequest{ID: "req-1", ScoreCardID: scoreCardID, RequestedBy: requestedBy, RequiredConfirmations: required, Status: "open", CreatedAt: time.Now()}, nil
}
func (m *mockReviewRepo) GetByScoreCard(_ context.Context, _ string) (*model.CommunityReviewRequest, error) {
	if m.req == nil {
		return nil, repository.ErrNotFound
	}
	return m.req, nil
}
func (m *mockReviewRepo) MarkVerified(_ context.Context, _ string) (bool, error) {
	m.markVerified = true
	return m.markVerifiedOK, nil
}
func (m *mockReviewRepo) Cancel(_ context.Context, _ string) error {
	m.cancelled = true
	return nil
}

type mockConfirmRepo struct {
	ownerID       string
	confirmErr    error
	count         int
	updatedTo     string
	confirmations []*model.ScoreConfirmation
}

func (m *mockConfirmRepo) GetScoreCardOwner(_ context.Context, _ string) (string, string, error) {
	return m.ownerID, "verified", nil
}
func (m *mockConfirmRepo) ConfirmScore(_ context.Context, scoreCardID, userID string) (*model.ScoreConfirmation, error) {
	if m.confirmErr != nil {
		return nil, m.confirmErr
	}
	return &model.ScoreConfirmation{ID: "conf-1", ScoreCardID: scoreCardID, ConfirmedBy: userID}, nil
}
func (m *mockConfirmRepo) ListConfirmations(_ context.Context, _ string) ([]*model.ScoreConfirmation, error) {
	return m.confirmations, nil
}
func (m *mockConfirmRepo) GetConfirmationCount(_ context.Context, _ string) (int, error) {
	return m.count, nil
}
func (m *mockConfirmRepo) UpdateScoreVerification(_ context.Context, _, status string) error {
	m.updatedTo = status
	return nil
}

type mockCardLookup struct {
	card *model.ScoreCard
}

func (m *mockCardLookup) GetByID(_ context.Context, _, userID string) (*model.ScoreCard, error) {
	if m.card == nil || m.card.UserID != userID {
		return nil, repository.ErrNotFound
	}
	return m.card, nil
}
func (m *mockCardLookup) GetPublicByID(_ context.Context, _ string) (*model.ScoreCard, error) {
	if m.card == nil {
		return nil, repository.ErrNotFound
	}
	return m.card, nil
}

func newReviewService(req *mockReviewRepo, cards *mockCardLookup, confirms *mockConfirmRepo) *CommunityReviewService {
	return NewCommunityReviewService(req, cards, confirms, nil, nil)
}

func personalCard(owner, visibility string) *model.ScoreCard {
	return &model.ScoreCard{ID: "card-1", UserID: owner, Visibility: visibility, TotalScore: 200, XCount: 4}
}

func TestRequestReview_RejectsLeagueCard(t *testing.T) {
	rid := "round-1"
	card := personalCard("u1", "public")
	card.LeagueRoundID = &rid
	svc := newReviewService(&mockReviewRepo{}, &mockCardLookup{card: card}, &mockConfirmRepo{})

	_, err := svc.RequestReview(context.Background(), "card-1", "u1")
	assert.ErrorIs(t, err, ErrCardIsLeague)
}

func TestRequestReview_RejectsDraftAndPrivate(t *testing.T) {
	draft := personalCard("u1", "public")
	draft.IsDraft = true
	svc := newReviewService(&mockReviewRepo{}, &mockCardLookup{card: draft}, &mockConfirmRepo{})
	_, err := svc.RequestReview(context.Background(), "card-1", "u1")
	assert.ErrorIs(t, err, ErrCardIsDraft)

	private := personalCard("u1", "private")
	svc = newReviewService(&mockReviewRepo{}, &mockCardLookup{card: private}, &mockConfirmRepo{})
	_, err = svc.RequestReview(context.Background(), "card-1", "u1")
	assert.ErrorIs(t, err, ErrCardIsPrivate)
}

func TestRequestReview_NonOwnerForbidden(t *testing.T) {
	svc := newReviewService(&mockReviewRepo{}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{})
	_, err := svc.RequestReview(context.Background(), "card-1", "someone-else")
	assert.ErrorIs(t, err, ErrNotCardOwner)
}

func TestRequestReview_DuplicateConflict(t *testing.T) {
	svc := newReviewService(&mockReviewRepo{createErr: repository.ErrConflict}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{})
	_, err := svc.RequestReview(context.Background(), "card-1", "u1")
	assert.ErrorIs(t, err, ErrReviewRequestExists)
}

func TestRequestReview_CreatesOpenRequest(t *testing.T) {
	repo := &mockReviewRepo{}
	svc := newReviewService(repo, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{})
	req, err := svc.RequestReview(context.Background(), "card-1", "u1")
	require.NoError(t, err)
	assert.True(t, repo.created)
	assert.Equal(t, defaultRequiredConfirmations, req.RequiredConfirmations)
}

func openRequest() *model.CommunityReviewRequest {
	return &model.CommunityReviewRequest{ID: "req-1", ScoreCardID: "card-1", RequestedBy: "u1", RequiredConfirmations: 3, Status: "open", CreatedAt: time.Now()}
}

func TestConfirmCard_OwnCardForbidden(t *testing.T) {
	svc := newReviewService(&mockReviewRepo{req: openRequest()}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{ownerID: "u1"})
	err := svc.ConfirmCard(context.Background(), "card-1", "u1")
	assert.ErrorIs(t, err, ErrCannotConfirmOwn)
}

func TestConfirmCard_AlreadyConfirmed(t *testing.T) {
	svc := newReviewService(&mockReviewRepo{req: openRequest()}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{ownerID: "u1", confirmErr: repository.ErrConflict})
	err := svc.ConfirmCard(context.Background(), "card-1", "u2")
	assert.ErrorIs(t, err, ErrAlreadyConfirmed)
}

func TestConfirmCard_ClosedRequestNotFound(t *testing.T) {
	req := openRequest()
	req.Status = "verified"
	svc := newReviewService(&mockReviewRepo{req: req}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{ownerID: "u1"})
	err := svc.ConfirmCard(context.Background(), "card-1", "u2")
	assert.ErrorIs(t, err, ErrReviewRequestNotFound)
}

func TestConfirmCard_BelowThresholdDoesNotVerify(t *testing.T) {
	reviews := &mockReviewRepo{req: openRequest()}
	confirms := &mockConfirmRepo{ownerID: "u1", count: 2}
	svc := newReviewService(reviews, &mockCardLookup{card: personalCard("u1", "public")}, confirms)
	require.NoError(t, svc.ConfirmCard(context.Background(), "card-1", "u2"))
	assert.False(t, reviews.markVerified)
	assert.Empty(t, confirms.updatedTo)
}

func TestConfirmCard_ThresholdVerifies(t *testing.T) {
	reviews := &mockReviewRepo{req: openRequest(), markVerifiedOK: true}
	confirms := &mockConfirmRepo{ownerID: "u1", count: 3}
	svc := newReviewService(reviews, &mockCardLookup{card: personalCard("u1", "public")}, confirms)
	require.NoError(t, svc.ConfirmCard(context.Background(), "card-1", "u2"))
	assert.True(t, reviews.markVerified)
	assert.Equal(t, "verified", confirms.updatedTo)
}

func TestConfirmCard_LostRaceDoesNotDoubleVerify(t *testing.T) {
	// MarkVerified reports the transition did not happen (another confirm won);
	// the card update and activity must be skipped.
	reviews := &mockReviewRepo{req: openRequest(), markVerifiedOK: false}
	confirms := &mockConfirmRepo{ownerID: "u1", count: 3}
	svc := newReviewService(reviews, &mockCardLookup{card: personalCard("u1", "public")}, confirms)
	require.NoError(t, svc.ConfirmCard(context.Background(), "card-1", "u2"))
	assert.True(t, reviews.markVerified)
	assert.Empty(t, confirms.updatedTo)
}

func TestCancelReview_OwnerOnlyAndOpenOnly(t *testing.T) {
	svc := newReviewService(&mockReviewRepo{req: openRequest()}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{})
	assert.ErrorIs(t, svc.CancelReview(context.Background(), "card-1", "u2"), ErrNotCardOwner)

	verified := openRequest()
	verified.Status = "verified"
	svc = newReviewService(&mockReviewRepo{req: verified}, &mockCardLookup{card: personalCard("u1", "public")}, &mockConfirmRepo{})
	assert.ErrorIs(t, svc.CancelReview(context.Background(), "card-1", "u1"), ErrReviewRequestNotFound)
}

func TestGetForCard_HidesInvisibleCards(t *testing.T) {
	private := personalCard("u1", "private")
	svc := newReviewService(&mockReviewRepo{}, &mockCardLookup{card: private}, &mockConfirmRepo{})

	// Owner can read their own card's status.
	_, err := svc.GetForCard(context.Background(), "card-1", "u1")
	assert.NoError(t, err)

	// Anyone else gets not-visible.
	_, err = svc.GetForCard(context.Background(), "card-1", "u2")
	assert.ErrorIs(t, err, ErrCardNotVisible)

	// League cards are not community-review surfaces for non-owners.
	rid := "round-1"
	leagueCard := personalCard("u1", "public")
	leagueCard.LeagueRoundID = &rid
	svc = newReviewService(&mockReviewRepo{}, &mockCardLookup{card: leagueCard}, &mockConfirmRepo{})
	_, err = svc.GetForCard(context.Background(), "card-1", "u2")
	assert.ErrorIs(t, err, ErrCardNotVisible)
}

func TestGetForCard_ViewerHasConfirmed(t *testing.T) {
	confirms := &mockConfirmRepo{confirmations: []*model.ScoreConfirmation{{ID: "c1", ScoreCardID: "card-1", ConfirmedBy: "u2"}}}
	svc := newReviewService(&mockReviewRepo{req: openRequest()}, &mockCardLookup{card: personalCard("u1", "public")}, confirms)

	resp, err := svc.GetForCard(context.Background(), "card-1", "u2")
	require.NoError(t, err)
	assert.True(t, resp.ViewerHasConfirmed)
	assert.Equal(t, 1, resp.ConfirmationCount)
}
