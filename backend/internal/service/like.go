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
	blocks     *repository.BlockRepository
}

func NewLikeService(likes *repository.LikeRepository, scoreCards *repository.ScoreCardRepository, blocks *repository.BlockRepository) *LikeService {
	return &LikeService{likes: likes, scoreCards: scoreCards, blocks: blocks}
}

// Like adds a like on a target. Returns true if a new like was created.
func (s *LikeService) Like(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	table, err := s.resolveTable(targetType)
	if err != nil {
		return false, err
	}

	// For score cards, check visibility and block status.
	if targetType == model.LikeTargetScoreCard {
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
		blocked, _ := s.blocks.IsBlocked(ctx, card.UserID, userID)
		if blocked {
			return false, ErrLikeTargetNotFound
		}
	}

	created, err := s.likes.Like(ctx, userID, targetID, targetType)
	if err != nil {
		return false, err
	}
	if created {
		_ = s.likes.IncrementLikeCount(ctx, targetID, table)
	}
	return created, nil
}

// Unlike removes a like. Returns true if a like was removed.
func (s *LikeService) Unlike(ctx context.Context, userID, targetID, targetType string) (bool, error) {
	table, err := s.resolveTable(targetType)
	if err != nil {
		return false, err
	}

	removed, err := s.likes.Unlike(ctx, userID, targetID, targetType)
	if err != nil {
		return false, err
	}
	if removed {
		_ = s.likes.DecrementLikeCount(ctx, targetID, table)
	}
	return removed, nil
}

func (s *LikeService) resolveTable(targetType string) (string, error) {
	switch targetType {
	case model.LikeTargetScoreCard:
		return "score_cards", nil
	case model.LikeTargetPost:
		return "posts", nil
	case model.LikeTargetComment:
		return "comments", nil
	default:
		return "", fmt.Errorf("%w: %s", ErrInvalidLikeTarget, targetType)
	}
}
