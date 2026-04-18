package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrSupportInvalidScope    = errors.New("invalid support scope")
	ErrSupportInvalidCategory = errors.New("invalid support category")
	ErrSupportInvalidStatus   = errors.New("invalid support status")
	ErrSupportInvalidPriority = errors.New("invalid support priority")
	ErrSupportTitleEmpty      = errors.New("support title cannot be empty")
	ErrSupportBodyEmpty       = errors.New("support message cannot be empty")
)

type SupportTicketService struct {
	repo *repository.SupportTicketRepository
}

func NewSupportTicketService(repo *repository.SupportTicketRepository) *SupportTicketService {
	return &SupportTicketService{repo: repo}
}

func (s *SupportTicketService) Create(ctx context.Context, requesterID string, in *model.CreateSupportTicketInput) (*model.SupportTicket, error) {
	if !model.IsValidSupportScopeType(in.ScopeType) {
		return nil, ErrSupportInvalidScope
	}
	if !model.IsValidSupportCategory(in.Category) {
		return nil, ErrSupportInvalidCategory
	}
	if in.Priority != "" && !model.IsValidSupportPriority(in.Priority) {
		return nil, ErrSupportInvalidPriority
	}
	if strings.TrimSpace(in.Title) == "" {
		return nil, ErrSupportTitleEmpty
	}
	if strings.TrimSpace(in.Description) == "" {
		return nil, ErrSupportBodyEmpty
	}
	return s.repo.Create(ctx, requesterID, in)
}

func (s *SupportTicketService) List(ctx context.Context, in *model.ListSupportTicketsInput) ([]*model.SupportTicket, error) {
	if in != nil {
		if in.Status != "" && !model.IsValidSupportStatus(in.Status) {
			return nil, ErrSupportInvalidStatus
		}
		if in.Category != "" && !model.IsValidSupportCategory(in.Category) {
			return nil, ErrSupportInvalidCategory
		}
		if in.ScopeType != "" && !model.IsValidSupportScopeType(in.ScopeType) {
			return nil, ErrSupportInvalidScope
		}
	}
	return s.repo.List(ctx, in)
}

func (s *SupportTicketService) GetByID(ctx context.Context, id string) (*model.SupportTicket, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *SupportTicketService) Update(ctx context.Context, id, actorID string, in *model.UpdateSupportTicketInput) (*model.SupportTicket, error) {
	if in.Status != nil && !model.IsValidSupportStatus(*in.Status) {
		return nil, ErrSupportInvalidStatus
	}
	if in.Category != nil && !model.IsValidSupportCategory(*in.Category) {
		return nil, ErrSupportInvalidCategory
	}
	if in.Priority != nil && !model.IsValidSupportPriority(*in.Priority) {
		return nil, ErrSupportInvalidPriority
	}
	return s.repo.Update(ctx, id, actorID, in)
}

func (s *SupportTicketService) AddMessage(ctx context.Context, ticketID, authorID string, in *model.AddSupportTicketMessageInput) (*model.SupportTicketMessage, error) {
	if strings.TrimSpace(in.Body) == "" {
		return nil, ErrSupportBodyEmpty
	}
	return s.repo.AddMessage(ctx, ticketID, authorID, in)
}

func (s *SupportTicketService) MarkRead(ctx context.Context, ticketID, userID string, in *model.MarkSupportTicketReadInput) error {
	if in == nil {
		return s.repo.MarkRead(ctx, ticketID, userID, nil)
	}
	return s.repo.MarkRead(ctx, ticketID, userID, in.LastReadAt)
}
