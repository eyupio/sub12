package service

import (
	"context"
	"errors"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCannotBlockSelf = errors.New("cannot block yourself")
	ErrNotBlocked      = errors.New("user is not blocked")
)

type BlockService struct {
	blocks *repository.BlockRepository
	social *repository.SocialRepository
}

func NewBlockService(blocks *repository.BlockRepository, social *repository.SocialRepository) *BlockService {
	return &BlockService{blocks: blocks, social: social}
}

// Block blocks a user and removes follow relationships in both directions.
func (s *BlockService) Block(ctx context.Context, blockerID, blockedID string) error {
	if blockerID == blockedID {
		return ErrCannotBlockSelf
	}
	if err := s.blocks.Block(ctx, blockerID, blockedID); err != nil {
		return err
	}
	// Mutual unfollow — ignore errors from non-existent relationships
	_ = s.social.Unfollow(ctx, blockerID, blockedID)
	_ = s.social.Unfollow(ctx, blockedID, blockerID)
	return nil
}

// Unblock removes a block relationship.
func (s *BlockService) Unblock(ctx context.Context, blockerID, blockedID string) error {
	err := s.blocks.Unblock(ctx, blockerID, blockedID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrNotBlocked
	}
	return err
}

// ListBlocked returns all users blocked by the given user.
func (s *BlockService) ListBlocked(ctx context.Context, blockerID string) ([]*model.UserBlock, error) {
	return s.blocks.ListBlocked(ctx, blockerID)
}
