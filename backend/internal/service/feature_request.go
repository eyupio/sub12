package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrFeatureRequestInvalidStatus   = errors.New("invalid feature request status")
	ErrFeatureRequestInvalidPriority = errors.New("invalid feature request priority")
	ErrFeatureRequestTitleEmpty      = errors.New("feature request title cannot be empty")
)

type FeatureRequestService struct {
	repo          *repository.FeatureRequestRepository
	tickets       *repository.SupportTicketRepository
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	users         *repository.UserRepository
	notifications *NotificationService
	activity      *ActivityService
}

func NewFeatureRequestService(
	repo *repository.FeatureRequestRepository,
	tickets *repository.SupportTicketRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	users *repository.UserRepository,
	notifications *NotificationService,
	activity *ActivityService,
) *FeatureRequestService {
	return &FeatureRequestService{
		repo:          repo,
		tickets:       tickets,
		leagues:       leagues,
		clubs:         clubs,
		users:         users,
		notifications: notifications,
		activity:      activity,
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
	item, err := s.repo.CreateFromTicket(ctx, ticket, actorID, input)
	if err != nil {
		return nil, err
	}

	// Close the originating ticket, ensure it's categorized as a feature, and
	// record a conversion event so the ticket timeline reflects the transition.
	// The SupportTicketService.Update call fans out feature_request_state_changed
	// notifications + emails to the requester and other participants because the
	// updated category is feature, so no extra fanout is required here.
	category := model.SupportCategoryFeature
	status := model.SupportStatusClosed
	updated, _ := s.tickets.Update(ctx, ticketID, actorID, &model.UpdateSupportTicketInput{
		Status:   &status,
		Category: &category,
	})
	_ = s.tickets.RecordConversionEvent(ctx, ticketID, actorID, item.ID)

	// Publish a public activity entry so the feed surfaces the new feature.
	if s.activity != nil && updated != nil {
		targetID := item.ID
		targetType := "feature_request"
		s.activity.Ingest(context.Background(), actorID, model.ActivityFeatureRequestCreated, &targetID, &targetType, model.FeatureRequestMeta{
			Title:     item.Title,
			Status:    item.Status,
			ScopeType: item.ScopeType,
		}, nil, nil, "public")
	}
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
	if in.Priority != nil && !model.IsValidFeatureRequestPriority(*in.Priority) {
		return nil, ErrFeatureRequestInvalidPriority
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
		if s.activity != nil && current.Status != updated.Status &&
			(updated.Status == model.FeatureRequestStatusImplemented || updated.Status == model.FeatureRequestStatusDone) {
			targetID := updated.ID
			targetType := "feature_request"
			s.activity.Ingest(context.Background(), actorID, model.ActivityFeatureRequestImplemented, &targetID, &targetType, model.FeatureRequestMeta{
				Title:     updated.Title,
				Status:    updated.Status,
				ScopeType: updated.ScopeType,
			}, nil, nil, "public")
		}
	}
	return updated, nil
}

func (s *FeatureRequestService) Get(ctx context.Context, id, viewerID string) (*model.FeatureRequest, error) {
	item, err := s.repo.GetByID(ctx, id, viewerID)
	if err != nil {
		return nil, err
	}
	ok, err := s.canVoteInScope(ctx, item.ScopeType, item.ScopeID, viewerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotAdmin
	}
	return item, nil
}

// Events returns the request's history, gated by the same scope visibility as
// the request itself.
func (s *FeatureRequestService) Events(ctx context.Context, id, viewerID string) ([]*model.FeatureRequestEvent, error) {
	if _, err := s.Get(ctx, id, viewerID); err != nil {
		return nil, err
	}
	return s.repo.ListEvents(ctx, id)
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

func (s *FeatureRequestService) AdminDelete(ctx context.Context, id, actorID string) error {
	current, err := s.repo.GetByID(ctx, id, actorID)
	if err != nil {
		return err
	}
	isAdmin, err := s.isAdminForScope(ctx, current.ScopeType, current.ScopeID, actorID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNotAdmin
	}
	return s.repo.Delete(ctx, id)
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
		return s.leagues.Can(ctx, *scopeID, userID, model.PermManageSupport)
	case model.SupportScopeClub:
		if scopeID == nil || *scopeID == "" {
			return false, nil
		}
		return s.clubs.Can(ctx, *scopeID, userID, model.PermManageSupport)
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
