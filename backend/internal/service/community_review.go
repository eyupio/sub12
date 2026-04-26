package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

const defaultRequiredConfirmations int16 = 3

var (
	ErrCardIsLeague          = errors.New("league cards use league verification")
	ErrCardAlreadyVerified   = errors.New("card already verified")
	ErrReviewRequestExists   = errors.New("review request already open")
	ErrReviewRequestNotFound = errors.New("review request not found")
	ErrNotCardOwner          = errors.New("not the card owner")
)

// CommunityReviewRepo is the persistence interface for community review request rows.
type CommunityReviewRepo interface {
	Create(ctx context.Context, scoreCardID, requestedBy string, requiredConfirmations int16) (*model.CommunityReviewRequest, error)
	GetByScoreCard(ctx context.Context, scoreCardID string) (*model.CommunityReviewRequest, error)
	MarkVerified(ctx context.Context, scoreCardID string) error
	Cancel(ctx context.Context, scoreCardID string) error
}

// ScoreConfirmationRepo is the persistence interface for the shared
// score_confirmations table (originally added for leagues, reused here).
type ScoreConfirmationRepo interface {
	GetScoreCardOwner(ctx context.Context, scoreCardID string) (string, error)
	ConfirmScore(ctx context.Context, scoreCardID, userID string) (*model.ScoreConfirmation, error)
	ListConfirmations(ctx context.Context, scoreCardID string) ([]*model.ScoreConfirmation, error)
	GetConfirmationCount(ctx context.Context, scoreCardID string) (int, error)
	UpdateScoreVerification(ctx context.Context, scoreCardID, status string) error
}

// ScoreCardLookupRepo exposes the minimal score-card fields the community
// review flow needs to enforce its rules and populate feed metadata.
type ScoreCardLookupRepo interface {
	GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error)
}

type CommunityReviewService struct {
	requests    CommunityReviewRepo
	cards       ScoreCardLookupRepo
	confirms    ScoreConfirmationRepo
	activity    *ActivityService
	achievement *AchievementService
}

func NewCommunityReviewService(
	requests CommunityReviewRepo,
	cards ScoreCardLookupRepo,
	confirms ScoreConfirmationRepo,
	activity *ActivityService,
	achievement *AchievementService,
) *CommunityReviewService {
	return &CommunityReviewService{
		requests:    requests,
		cards:       cards,
		confirms:    confirms,
		activity:    activity,
		achievement: achievement,
	}
}

// RequestReview opens a community review on a personal practice card.
func (s *CommunityReviewService) RequestReview(ctx context.Context, scoreCardID, ownerID string) (*model.CommunityReviewRequest, error) {
	card, err := s.cards.GetByID(ctx, scoreCardID, ownerID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrNotCardOwner
	}
	if err != nil {
		return nil, fmt.Errorf("load score card: %w", err)
	}
	if card.LeagueRoundID != nil {
		return nil, ErrCardIsLeague
	}

	req, err := s.requests.Create(ctx, scoreCardID, ownerID, defaultRequiredConfirmations)
	if errors.Is(err, repository.ErrConflict) {
		return nil, ErrReviewRequestExists
	}
	if err != nil {
		return nil, err
	}

	if s.activity != nil {
		tt := "score_card"
		meta := model.CommunityReviewMeta{
			TotalScore:            card.TotalScore,
			XCount:                card.XCount,
			RequiredConfirmations: req.RequiredConfirmations,
			CardImageURL:          card.CardImageURL,
		}
		go s.activity.Ingest(context.Background(), ownerID, model.ActivityCommunityReviewRequested, &scoreCardID, &tt, meta, nil, nil, "public")
	}
	return req, nil
}

// CancelReview removes an open community review request. Owner-only.
func (s *CommunityReviewService) CancelReview(ctx context.Context, scoreCardID, ownerID string) error {
	req, err := s.requests.GetByScoreCard(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrReviewRequestNotFound
	}
	if err != nil {
		return err
	}
	if req.RequestedBy != ownerID {
		return ErrNotCardOwner
	}
	if req.Status != "open" {
		return ErrReviewRequestNotFound
	}
	if err := s.requests.Cancel(ctx, scoreCardID); err != nil {
		return err
	}
	return nil
}

// ConfirmCard records a confirmation from a non-owner reviewer. If the
// configured threshold is reached, the card auto-flips to verified and an
// `community_review_verified` activity is emitted. Reviewer achievements are
// evaluated regardless of whether the threshold was hit.
func (s *CommunityReviewService) ConfirmCard(ctx context.Context, scoreCardID, reviewerID string) error {
	req, err := s.requests.GetByScoreCard(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrReviewRequestNotFound
	}
	if err != nil {
		return err
	}
	if req.Status != "open" {
		return ErrReviewRequestNotFound
	}

	ownerID, err := s.confirms.GetScoreCardOwner(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrReviewRequestNotFound
	}
	if err != nil {
		return err
	}
	if ownerID == reviewerID {
		return ErrCannotConfirmOwn
	}

	if _, err := s.confirms.ConfirmScore(ctx, scoreCardID, reviewerID); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return ErrAlreadyConfirmed
		}
		return err
	}

	count, err := s.confirms.GetConfirmationCount(ctx, scoreCardID)
	if err != nil {
		return err
	}

	thresholdReached := count >= int(req.RequiredConfirmations)
	if thresholdReached {
		if err := s.confirms.UpdateScoreVerification(ctx, scoreCardID, "verified"); err != nil {
			return err
		}
		if err := s.requests.MarkVerified(ctx, scoreCardID); err != nil {
			return err
		}
		if s.activity != nil {
			tt := "score_card"
			meta := model.CommunityReviewMeta{
				RequiredConfirmations: req.RequiredConfirmations,
			}
			go s.activity.Ingest(context.Background(), ownerID, model.ActivityCommunityReviewVerified, &scoreCardID, &tt, meta, nil, nil, "public")
		}
	}

	if s.achievement != nil {
		go s.achievement.EvaluateForCommunityReview(context.Background(), reviewerID, req.CreatedAt)
	}
	return nil
}

// GetForCard returns the request status, confirmations, and viewer-specific
// flags for the score card detail page.
func (s *CommunityReviewService) GetForCard(ctx context.Context, scoreCardID, viewerID string) (*model.CommunityReviewStatusResponse, error) {
	resp := &model.CommunityReviewStatusResponse{
		Confirmations: []*model.ScoreConfirmation{},
	}
	req, err := s.requests.GetByScoreCard(ctx, scoreCardID)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	if req != nil {
		resp.Request = req
	}

	confs, err := s.confirms.ListConfirmations(ctx, scoreCardID)
	if err != nil {
		return nil, err
	}
	if confs != nil {
		resp.Confirmations = confs
	}
	resp.ConfirmationCount = len(resp.Confirmations)
	if viewerID != "" {
		for _, c := range resp.Confirmations {
			if c.ConfirmedBy == viewerID {
				resp.ViewerHasConfirmed = true
				break
			}
		}
	}
	return resp, nil
}
