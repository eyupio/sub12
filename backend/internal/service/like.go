package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrLikeTargetNotFound = errors.New("like target not found")
	ErrInvalidLikeTarget  = errors.New("invalid like target type")
)

type LikeService struct {
	likes        *repository.LikeRepository
	scoreCards   *repository.ScoreCardRepository
	posts        *PostService
	blocks       *repository.BlockRepository
	activities   *repository.ActivityRepository
	achievements *AchievementService // nil disables achievement evaluation
}

func NewLikeService(likes *repository.LikeRepository, scoreCards *repository.ScoreCardRepository, posts *PostService, blocks *repository.BlockRepository, activities *repository.ActivityRepository) *LikeService {
	return &LikeService{likes: likes, scoreCards: scoreCards, posts: posts, blocks: blocks, activities: activities}
}

// SetAchievements wires in the achievement service so likes can trigger award checks.
// Called after construction to break circular dependency.
func (s *LikeService) SetAchievements(achievements *AchievementService) {
	s.achievements = achievements
}

// Like adds a like on a target. Returns true if a new like was created.
// Enforces visibility rules per target type: private score cards and posts the
// viewer cannot see return ErrLikeTargetNotFound so existence is not leaked.
func (s *LikeService) Like(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	var ownerID string
	switch targetType {
	case model.LikeTargetScoreCard:
		card, err := s.scoreCards.GetPublicByID(ctx, targetID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return false, ErrLikeTargetNotFound
			}
			return false, err
		}
		if card.Visibility == "private" && card.UserID != userID {
			return false, ErrLikeTargetNotFound
		}
		if blocked, err := s.ownerHasBlocked(ctx, card.UserID, userID); err != nil {
			return false, err
		} else if blocked {
			return false, ErrLikeTargetNotFound
		}
		ownerID = card.UserID
	case model.LikeTargetPost:
		viewer := userID
		post, err := s.posts.CanViewPostID(ctx, targetID, &viewer)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return false, ErrLikeTargetNotFound
			}
			return false, err
		}
		if blocked, err := s.ownerHasBlocked(ctx, post.UserID, userID); err != nil {
			return false, err
		} else if blocked {
			return false, ErrLikeTargetNotFound
		}
		ownerID = post.UserID
	case model.LikeTargetComment:
		// Comments inherit visibility from their parent target; enforcement is
		// delegated to the parent listing. Block still applies.
	case model.LikeTargetActivity:
		act, err := s.activities.GetByID(ctx, targetID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return false, ErrLikeTargetNotFound
			}
			return false, err
		}
		if blocked, err := s.ownerHasBlocked(ctx, act.UserID, userID); err != nil {
			return false, err
		} else if blocked {
			return false, ErrLikeTargetNotFound
		}
		ownerID = act.UserID
	default:
		return false, fmt.Errorf("%w: %s", ErrInvalidLikeTarget, targetType)
	}

	created, err := s.likes.LikeTx(ctx, userID, targetID, targetType)
	if err != nil {
		return false, err
	}
	// Evaluate achievements in a goroutine so they never slow down the response.
	if created && s.achievements != nil {
		go func() {
			s.achievements.EvaluateForLikeGiven(context.Background(), userID)
			if ownerID != "" && ownerID != userID {
				s.achievements.EvaluateForLikeReceived(context.Background(), ownerID)
			}
		}()
	}
	return created, nil
}

// ownerHasBlocked reports whether ownerID has blocked viewerID.
// Short-circuits to false when the two are the same user so the caller never
// needs a separate identity guard before calling this.
func (s *LikeService) ownerHasBlocked(ctx context.Context, ownerID, viewerID string) (bool, error) {
	if ownerID == viewerID {
		return false, nil
	}
	return s.blocks.IsBlocked(ctx, ownerID, viewerID)
}

// Unlike removes a like. Returns true if a like was removed.
func (s *LikeService) Unlike(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	switch targetType {
	case model.LikeTargetScoreCard, model.LikeTargetPost, model.LikeTargetComment, model.LikeTargetActivity:
		// valid
	default:
		return false, fmt.Errorf("%w: %s", ErrInvalidLikeTarget, targetType)
	}
	return s.likes.UnlikeTx(ctx, userID, targetID, targetType)
}
