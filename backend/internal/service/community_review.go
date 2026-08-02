package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

const defaultRequiredConfirmations int16 = 3

var (
	ErrCardIsLeague          = errors.New("league cards use league verification")
	ErrCardIsDraft           = errors.New("draft cards cannot be reviewed")
	ErrCardIsPrivate         = errors.New("private cards cannot be reviewed")
	ErrCardAlreadyVerified   = errors.New("card already verified")
	ErrReviewRequestExists   = errors.New("review request already open")
	ErrReviewRequestNotFound = errors.New("review request not found")
	ErrNotCardOwner          = errors.New("not the card owner")
	ErrCardNotVisible        = errors.New("score card not visible")
)

// CommunityReviewRepo is the persistence interface for community review request rows.
type CommunityReviewRepo interface {
	Create(ctx context.Context, scoreCardID, requestedBy string, requiredConfirmations int16) (*model.CommunityReviewRequest, error)
	GetByScoreCard(ctx context.Context, scoreCardID string) (*model.CommunityReviewRequest, error)
	MarkVerified(ctx context.Context, scoreCardID string) (bool, error)
	Cancel(ctx context.Context, scoreCardID string) error
}

// ScoreConfirmationRepo is the persistence interface for the shared
// score_confirmations table (originally added for leagues, reused here).
type ScoreConfirmationRepo interface {
	GetScoreCardOwner(ctx context.Context, scoreCardID string) (ownerID, verification string, err error)
	ConfirmScore(ctx context.Context, scoreCardID, userID string) (*model.ScoreConfirmation, error)
	ListConfirmations(ctx context.Context, scoreCardID string) ([]*model.ScoreConfirmation, error)
	GetConfirmationCount(ctx context.Context, scoreCardID string) (int, error)
	UpdateScoreVerification(ctx context.Context, scoreCardID, status string) error
}

// ScoreCardLookupRepo exposes the minimal score-card fields the community
// review flow needs to enforce its rules and populate feed metadata.
type ScoreCardLookupRepo interface {
	GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error)
	GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error)
}

// FollowerLister returns the ids of a user's followers, newest first. A
// community review is addressed to them: they are the people the request's
// feed post reaches, and the ones who can act on it.
type FollowerLister interface {
	ListFollowerIDs(ctx context.Context, userID string, limit int) ([]string, error)
}

// ReviewVolunteerRepo lists the people who opted in to being asked to validate
// other shooters' cards. Volunteers are additive: they widen an audience that
// already has a natural core (the shooter's followers on a personal card, the
// moderators on a league one), never replace it.
type ReviewVolunteerRepo interface {
	ListPublicReviewVolunteers(ctx context.Context, limit int) ([]string, error)
	ListLeagueReviewVolunteers(ctx context.Context, leagueID string, limit int) ([]string, error)
	ListClubLeagueReviewVolunteers(ctx context.Context, clubID string, limit int) ([]string, error)
}

// reviewRequestFanoutLimit caps how many followers are told about a review
// request. A shooter with a large following would otherwise write one
// notification row per follower on a single button press.
const reviewRequestFanoutLimit = 200

// reviewVolunteerLimit caps each volunteer pool separately, so opting in to
// public review requests doesn't mean receiving every one ever raised.
const reviewVolunteerLimit = 200

type CommunityReviewService struct {
	requests      CommunityReviewRepo
	cards         ScoreCardLookupRepo
	confirms      ScoreConfirmationRepo
	activity      *ActivityService
	achievement   *AchievementService
	notifications *NotificationService // nil disables notification fan-out
	followers     FollowerLister       // nil disables review-request fan-out
	volunteers    ReviewVolunteerRepo  // nil limits the audience to followers
	log           zerolog.Logger
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

// SetNotifications wires notification fan-out. Optional — nil disables it.
func (s *CommunityReviewService) SetNotifications(n *NotificationService) {
	s.notifications = n
}

// SetFollowers wires the follower lookup used to tell people a personal card
// is waiting on validation. Optional — nil leaves the request feed-only.
func (s *CommunityReviewService) SetFollowers(f FollowerLister) {
	s.followers = f
}

// SetReviewVolunteers wires the opt-in pool that widens a public card's
// validation request beyond the shooter's own followers.
func (s *CommunityReviewService) SetReviewVolunteers(v ReviewVolunteerRepo) {
	s.volunteers = v
}

// SetLogger wires the logger used by background goroutines for panic recovery.
func (s *CommunityReviewService) SetLogger(log zerolog.Logger) {
	s.log = log
}

// safeGo runs fn in a goroutine, recovering panics so a failure in async
// activity/achievement ingestion cannot crash the API process.
func (s *CommunityReviewService) safeGo(name string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.log.Error().Interface("panic", r).Str("task", name).Msg("community_review: background task panicked")
			}
		}()
		fn()
	}()
}

// RequestReview opens a community review on a personal practice card. Drafts
// and private cards are refused: the request is broadcast to the feed, so the
// card must be something other users are allowed to see.
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
	if card.IsDraft {
		return nil, ErrCardIsDraft
	}
	if card.Visibility == "private" {
		return nil, ErrCardIsPrivate
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
		visibility := card.Visibility
		s.safeGo("activity.Ingest(review_requested)", func() {
			s.activity.Ingest(context.Background(), ownerID, model.ActivityCommunityReviewRequested, &scoreCardID, &tt, meta, nil, nil, visibility)
		})
	}
	s.notifyValidationRequested(scoreCardID, ownerID, card.Visibility, card.TotalScore, req.RequiredConfirmations)
	return req, nil
}

// notifyValidationRequested rings the bell for the people who can confirm a
// personal card: the shooter's followers, plus — on a public card — anyone who
// volunteered to check public cards. A followers-only card stays with the
// followers; it was never offered to strangers, and a validation request must
// not be the thing that widens its audience.
//
// Runs in the background because the fan-out is one row per recipient and the
// shooter is waiting on the response.
func (s *CommunityReviewService) notifyValidationRequested(
	scoreCardID, ownerID, visibility string, totalScore, requiredConfirmations int16,
) {
	if s.notifications == nil {
		return
	}
	s.safeGo("notifications.Fanout(validation_requested)", func() {
		bg := context.Background()

		var ids []string
		if s.followers != nil {
			followers, err := s.followers.ListFollowerIDs(bg, ownerID, reviewRequestFanoutLimit)
			if err != nil {
				s.log.Warn().Err(err).Str("owner_id", ownerID).Msg("community_review: load followers for validation fan-out failed")
			} else {
				ids = append(ids, followers...)
			}
		}
		if s.volunteers != nil && visibility == "public" {
			volunteers, err := s.volunteers.ListPublicReviewVolunteers(bg, reviewVolunteerLimit)
			if err != nil {
				s.log.Warn().Err(err).Msg("community_review: load public review volunteers failed")
			} else {
				ids = append(ids, volunteers...)
			}
		}

		tid, tt := scoreCardID, "score_card"
		for _, rid := range dedupeExcluding(ids, map[string]struct{}{ownerID: {}}) {
			s.notifications.Fanout(bg, NotifEvent{
				RecipientID: rid,
				ActorID:     ownerID,
				Type:        model.NotificationTypeScoreValidationRequested,
				TargetID:    &tid,
				TargetType:  &tt,
				Metadata: map[string]any{
					"scope":                  "personal",
					"total_score":            totalScore,
					"required_confirmations": requiredConfirmations,
				},
			})
		}
	})
}

// CancelReview removes an open community review request. Owner-only. The
// confirmations gathered under the request and the feed post advertising it
// are removed with it.
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
	if s.activity != nil {
		s.safeGo("activity.RemoveReviewRequest(cancel)", func() {
			s.activity.RemoveReviewRequestFromFeed(context.Background(), scoreCardID)
		})
	}
	return nil
}

// ConfirmCard records a confirmation from a non-owner reviewer. If the
// configured threshold is reached, the card auto-flips to verified, a
// `community_review_verified` activity is emitted, and the owner is notified.
// Reviewer achievements are evaluated regardless of whether the threshold was
// hit.
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

	ownerID, _, err := s.confirms.GetScoreCardOwner(ctx, scoreCardID)
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

	if count >= int(req.RequiredConfirmations) {
		// MarkVerified is the arbiter: the request row flips open → verified
		// exactly once, so a confirmation racing this one (or a re-request
		// racing a cancel) cannot double-emit the verified activity.
		verified, err := s.requests.MarkVerified(ctx, scoreCardID)
		if err != nil {
			return err
		}
		if verified {
			if err := s.confirms.UpdateScoreVerification(ctx, scoreCardID, "verified"); err != nil {
				return err
			}
			if s.activity != nil {
				tt := "score_card"
				meta := model.CommunityReviewMeta{
					RequiredConfirmations: req.RequiredConfirmations,
				}
				// Populate the card preview so the verified feed post doesn't
				// render a zero score with a blank target.
				if card, cardErr := s.cards.GetByID(ctx, scoreCardID, ownerID); cardErr == nil {
					meta.TotalScore = card.TotalScore
					meta.XCount = card.XCount
					meta.CardImageURL = card.CardImageURL
					visibility := card.Visibility
					s.safeGo("activity.Ingest(review_verified)", func() {
						s.activity.Ingest(context.Background(), ownerID, model.ActivityCommunityReviewVerified, &scoreCardID, &tt, meta, nil, nil, visibility)
					})
				} else {
					s.safeGo("activity.Ingest(review_verified)", func() {
						s.activity.Ingest(context.Background(), ownerID, model.ActivityCommunityReviewVerified, &scoreCardID, &tt, meta, nil, nil, "public")
					})
				}
			}
			if s.notifications != nil {
				tid, tt := scoreCardID, "score_card"
				s.notifications.Fanout(ctx, NotifEvent{
					RecipientID: ownerID,
					ActorID:     reviewerID,
					Type:        model.NotificationTypeScoreVerified,
					TargetID:    &tid,
					TargetType:  &tt,
				})
			}
		}
	}

	if s.achievement != nil {
		createdAt := req.CreatedAt
		s.safeGo("achievement.EvaluateForCommunityReview", func() {
			s.achievement.EvaluateForCommunityReview(context.Background(), reviewerID, createdAt)
		})
	}
	return nil
}

// GetForCard returns the request status, confirmations, and viewer-specific
// flags for the score card detail page. Visibility follows the card: the owner
// always sees it; other viewers only when the card itself is shareable
// (non-draft, non-private, not a league card).
func (s *CommunityReviewService) GetForCard(ctx context.Context, scoreCardID, viewerID string) (*model.CommunityReviewStatusResponse, error) {
	card, err := s.cards.GetPublicByID(ctx, scoreCardID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrCardNotVisible
	}
	if err != nil {
		return nil, err
	}
	if viewerID == "" || viewerID != card.UserID {
		if card.IsDraft || card.Visibility == "private" || card.LeagueRoundID != nil {
			return nil, ErrCardNotVisible
		}
	}

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
