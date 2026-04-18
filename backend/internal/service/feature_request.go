package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrFeatureRequestInvalidStatus = errors.New("invalid feature request status")
	ErrFeatureRequestTitleEmpty    = errors.New("feature request title cannot be empty")
)

type FeatureRequestService struct {
	repo          *repository.FeatureRequestRepository
	tickets       *repository.SupportTicketRepository
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	users         *repository.UserRepository
	notifications *NotificationService
}

func NewFeatureRequestService(
	repo *repository.FeatureRequestRepository,
	tickets *repository.SupportTicketRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	users *repository.UserRepository,
	notifications *NotificationService,
) *FeatureRequestService {
	return &FeatureRequestService{
		repo:          repo,
		tickets:       tickets,
		leagues:       leagues,
		clubs:         clubs,
		users:         users,
		notifications: notifications,
	}
}

func (s *FeatureRequestService) CreateFromTicket(ctx context.Context, ticketID, actorID string, in *model.CreateFeatureRequestFromTicketInput) (*model.FeatureRequest, error) {
	ticket, err := s.tickets.GetByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	isAdmin, err := s.isAdminForScope(ctx, ticket.ScopeType, ticket.ScopeID, actorID)
	if err != nil {
		return nil, err
	}
	if !isAdmin {
		return nil, ErrNotAdmin
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = strings.TrimSpace(ticket.Title)
	}
	if title == "" {
		return nil, ErrFeatureRequestTitleEmpty
	}
	input := &model.CreateFeatureRequestFromTicketInput{
		Title:              title,
		RefinedDescription: strings.TrimSpace(in.RefinedDescription),
		OwnerAdminID:       in.OwnerAdminID,
	}
	item, err := s.repo.CreateFromTicket(ctx, ticket, input)
	if err != nil {
		return nil, err
	}
	_, _ = s.tickets.Update(ctx, ticketID, actorID, &model.UpdateSupportTicketInput{Status: ptrString(model.SupportStatusInProgress)})
	return item, nil
}

func (s *FeatureRequestService) Update(ctx context.Context, id, actorID string, in *model.UpdateFeatureRequestInput) (*model.FeatureRequest, error) {
	current, err := s.repo.GetByID(ctx, id, actorID)
	if err != nil {
		return nil, err
	}
	isAdmin, err := s.isAdminForScope(ctx, current.ScopeType, current.ScopeID, actorID)
	if err != nil {
		return nil, err
	}
	if !isAdmin {
		return nil, ErrNotAdmin
	}
	if in.Status != nil && !model.IsValidFeatureRequestStatus(*in.Status) {
		return nil, ErrFeatureRequestInvalidStatus
	}
	if in.Title != nil {
		title := strings.TrimSpace(*in.Title)
		if title == "" {
			return nil, ErrFeatureRequestTitleEmpty
		}
		in.Title = &title
	}
	if in.RefinedDescription != nil {
		trimmed := strings.TrimSpace(*in.RefinedDescription)
		in.RefinedDescription = &trimmed
	}
	updated, err := s.repo.Update(ctx, id, in, actorID)
	if err != nil {
		return nil, err
	}
	if in.Status != nil {
		s.notifyParticipants(ctx, updated, actorID)
	}
	return updated, nil
}

func (s *FeatureRequestService) List(ctx context.Context, viewerID string, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	items, err := s.repo.List(ctx, in)
	if err != nil {
		return nil, err
	}
	return s.filterByVisibility(ctx, viewerID, items)
}

func (s *FeatureRequestService) Rank(ctx context.Context, viewerID string, in *model.ListFeatureRequestsInput) ([]*model.FeatureRequest, error) {
	items, err := s.repo.ListRanked(ctx, in)
	if err != nil {
		return nil, err
	}
	return s.filterByVisibility(ctx, viewerID, items)
}

func (s *FeatureRequestService) Vote(ctx context.Context, id, voterID string, upvote bool) (*model.FeatureRequest, error) {
	item, err := s.repo.GetByID(ctx, id, voterID)
	if err != nil {
		return nil, err
	}
	ok, err := s.canVoteInScope(ctx, item.ScopeType, item.ScopeID, voterID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotAdmin
	}
	if upvote {
		if err := s.repo.AddVote(ctx, id, voterID); err != nil {
			return nil, err
		}
	} else {
		if err := s.repo.RemoveVote(ctx, id, voterID); err != nil {
			return nil, err
		}
	}
	return s.repo.GetByID(ctx, id, voterID)
}

func (s *FeatureRequestService) filterByVisibility(ctx context.Context, viewerID string, items []*model.FeatureRequest) ([]*model.FeatureRequest, error) {
	if viewerID == "" {
		return items, nil
	}
	allowed := make([]*model.FeatureRequest, 0, len(items))
	for _, item := range items {
		ok, err := s.canVoteInScope(ctx, item.ScopeType, item.ScopeID, viewerID)
		if err != nil {
			return nil, err
		}
		if ok {
			allowed = append(allowed, item)
		}
	}
	return allowed, nil
}

func (s *FeatureRequestService) canVoteInScope(ctx context.Context, scopeType string, scopeID *string, userID string) (bool, error) {
	switch scopeType {
	case model.SupportScopePlatform:
		return true, nil
	case model.SupportScopeLeague:
		if scopeID == nil || *scopeID == "" {
			return false, nil
		}
		return s.leagues.IsMember(ctx, *scopeID, userID)
	case model.SupportScopeClub:
		if scopeID == nil || *scopeID == "" {
			return false, nil
		}
		return s.clubs.IsMember(ctx, *scopeID, userID)
	default:
		return false, nil
	}
}

func (s *FeatureRequestService) isAdminForScope(ctx context.Context, scopeType string, scopeID *string, userID string) (bool, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if user.Role == "admin" {
		return true, nil
	}
	switch scopeType {
	case model.SupportScopePlatform:
		return false, nil
	case model.SupportScopeLeague:
		if scopeID == nil || *scopeID == "" {
			return false, nil
		}
		return s.leagues.IsAdmin(ctx, *scopeID, userID)
	case model.SupportScopeClub:
		if scopeID == nil || *scopeID == "" {
			return false, nil
		}
		return s.clubs.IsAdmin(ctx, *scopeID, userID)
	default:
		return false, nil
	}
}

func (s *FeatureRequestService) notifyParticipants(ctx context.Context, item *model.FeatureRequest, actorID string) {
	if s == nil || s.notifications == nil || item == nil {
		return
	}
	participants, err := s.tickets.ListParticipants(ctx, item.TicketID)
	if err != nil {
		return
	}
	for _, p := range participants {
		if p.UserID == "" || p.UserID == actorID {
			continue
		}
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: p.UserID,
			ActorID:     actorID,
			Type:        model.NotificationTypeFeatureRequestStateChanged,
			TargetID:    &item.ID,
			TargetType:  ptrString("feature_request"),
		})
	}
}
