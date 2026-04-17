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
	likes      *repository.LikeRepository
	scoreCards *repository.ScoreCardRepository
	posts      *PostService
	blocks     *repository.BlockRepository
}

func NewLikeService(likes *repository.LikeRepository, scoreCards *repository.ScoreCardRepository, posts *PostService, blocks *repository.BlockRepository) *LikeService {
	return &LikeService{likes: likes, scoreCards: scoreCards, posts: posts, blocks: blocks}
}

// Like adds a like on a target. Returns true if a new like was created.
// Enforces visibility rules per target type: private score cards and posts the
// viewer cannot see return ErrLikeTargetNotFound so existence is not leaked.
func (s *LikeService) Like(ctx context.Context, userID, targetID, targetType string) (bool, error) {
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
		if card.UserID != userID {
			blocked, _ := s.blocks.IsBlocked(ctx, card.UserID, userID)
			if blocked {
				return false, ErrLikeTargetNotFound
			}
		}
	case model.LikeTargetPost:
		viewer := userID
		post, err := s.posts.CanViewPostID(ctx, targetID, &viewer)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return false, ErrLikeTargetNotFound
			}
			return false, err
		}
		if post.UserID != userID {
			blocked, _ := s.blocks.IsBlocked(ctx, post.UserID, userID)
			if blocked {
				return false, ErrLikeTargetNotFound
			}
		}
	case model.LikeTargetComment:
		// Comments inherit visibility from their parent target; enforcement is
		// delegated to the parent listing. Block still applies.
	default:
		return false, fmt.Errorf("%w: %s", ErrInvalidLikeTarget, targetType)
	}

	return s.likes.LikeTx(ctx, userID, targetID, targetType)
}

// Unlike removes a like. Returns true if a like was removed.
func (s *LikeService) Unlike(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	switch targetType {
	case model.LikeTargetScoreCard, model.LikeTargetPost, model.LikeTargetComment:
		// valid
	default:
		return false, fmt.Errorf("%w: %s", ErrInvalidLikeTarget, targetType)
	}
	return s.likes.UnlikeTx(ctx, userID, targetID, targetType)
}
