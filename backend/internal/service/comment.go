package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCommentEmpty    = errors.New("comment body cannot be empty")
	ErrCommentTooLong  = errors.New("comment body exceeds maximum length of 2000 characters")
	ErrCommentDenied   = errors.New("you cannot comment on this score card")
)

type CommentService struct {
	comments   *repository.CommentRepository
	scoreCards *repository.ScoreCardRepository
	blocks     *repository.BlockRepository
}

func NewCommentService(comments *repository.CommentRepository, scoreCards *repository.ScoreCardRepository, blocks *repository.BlockRepository) *CommentService {
	return &CommentService{comments: comments, scoreCards: scoreCards, blocks: blocks}
}

// Create validates input, verifies the card exists, and persists the comment.
func (s *CommentService) Create(ctx context.Context, cardID, userID, body string) (*model.Comment, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrCommentEmpty
	}
	if len([]rune(body)) > 2000 {
		return nil, ErrCommentTooLong
	}
	// Verify the card exists (public lookup — no ownership check)
	card, err := s.scoreCards.GetPublicByID(ctx, cardID)
	if err != nil {
		return nil, err // propagates ErrNotFound
	}
	// If the card is private and the commenter is not the owner, deny
	if card.Visibility == "private" && card.UserID != userID {
		return nil, ErrCommentDenied
	}
	// If the card owner has blocked the commenter (or vice versa), deny
	if card.UserID != userID {
		blocked, err := s.blocks.IsBlocked(ctx, card.UserID, userID)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, ErrCommentDenied
		}
	}
	return s.comments.Create(ctx, cardID, userID, body)
}

// List returns all comments for a card.
func (s *CommentService) List(ctx context.Context, cardID string) ([]*model.Comment, error) {
	return s.comments.List(ctx, cardID)
}

// Update edits a comment owned by userID.
func (s *CommentService) Update(ctx context.Context, commentID, userID, body string) (*model.Comment, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrCommentEmpty
	}
	if len([]rune(body)) > 2000 {
		return nil, ErrCommentTooLong
	}
	comment, err := s.comments.Update(ctx, commentID, userID, body)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, repository.ErrNotFound
	}
	return comment, err
}

// Delete removes a comment owned by userID.
func (s *CommentService) Delete(ctx context.Context, commentID, userID string) error {
	err := s.comments.Delete(ctx, commentID, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return repository.ErrNotFound
	}
	return err
}
