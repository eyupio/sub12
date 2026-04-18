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
	repo          *repository.SupportTicketRepository
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	users         *repository.UserRepository
	notifications *NotificationService
}

func NewSupportTicketService(
	repo *repository.SupportTicketRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	users *repository.UserRepository,
	notifications *NotificationService,
) *SupportTicketService {
	return &SupportTicketService{repo: repo, leagues: leagues, clubs: clubs, users: users, notifications: notifications}
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
	if err := s.authorizeRequesterScope(ctx, requesterID, in.ScopeType, in.ScopeID); err != nil {
		return nil, err
	}
	ticket, err := s.repo.Create(ctx, requesterID, in)
	if err != nil {
		return nil, err
	}
	s.notifyScopeAdmins(ctx, ticket, requesterID, model.NotificationTypeTicketCreated)
	return ticket, nil
}

func (s *SupportTicketService) List(ctx context.Context, viewerID string, in *model.ListSupportTicketsInput) ([]*model.SupportTicket, error) {
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
	items, err := s.repo.List(ctx, in)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		s.normalizeUnread(item)
	}
	if viewerID == "" {
		return items, nil
	}
	allowed := make([]*model.SupportTicket, 0, len(items))
	for _, item := range items {
		ok, err := s.canAccessTicket(ctx, item, viewerID)
		if err != nil {
			return nil, err
		}
		if ok {
			allowed = append(allowed, item)
		}
	}
	return allowed, nil
}

func (s *SupportTicketService) GetByID(ctx context.Context, id string, viewerID string, includeInternal bool) (*model.SupportTicketDetail, error) {
	ticket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	ok, err := s.canAccessTicket(ctx, ticket, viewerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotAdmin
	}
	messages, err := s.repo.ListMessages(ctx, id, includeInternal)
	if err != nil {
		return nil, err
	}
	events, err := s.repo.ListEvents(ctx, id)
	if err != nil {
		return nil, err
	}
	participants, err := s.repo.ListParticipants(ctx, id)
	if err != nil {
		return nil, err
	}
	s.normalizeUnread(ticket)
	return &model.SupportTicketDetail{
		Ticket:       ticket,
		Messages:     messages,
		Events:       events,
		Participants: participants,
	}, nil
}

func (s *SupportTicketService) Update(ctx context.Context, id, actorID string, in *model.UpdateSupportTicketInput) (*model.SupportTicket, error) {
	ticket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	canAccess, err := s.canAccessTicket(ctx, ticket, actorID)
	if err != nil {
		return nil, err
	}
	if !canAccess {
		return nil, ErrNotAdmin
	}
	if in.AssigneeID != nil || in.Priority != nil || in.Category != nil {
		isAdmin, err := s.isAdminForTicket(ctx, ticket, actorID)
		if err != nil {
			return nil, err
		}
		if !isAdmin {
			return nil, ErrNotAdmin
		}
	}
	if in.Status != nil && !model.IsValidSupportStatus(*in.Status) {
		return nil, ErrSupportInvalidStatus
	}
	if in.Status != nil {
		if !isValidSupportTransition(ticket.Status, *in.Status) {
			return nil, ErrSupportInvalidStatus
		}
	}
	if in.Category != nil && !model.IsValidSupportCategory(*in.Category) {
		return nil, ErrSupportInvalidCategory
	}
	if in.Priority != nil && !model.IsValidSupportPriority(*in.Priority) {
		return nil, ErrSupportInvalidPriority
	}
	updated, err := s.repo.Update(ctx, id, actorID, in)
	if err != nil {
		return nil, err
	}
	if s.notifications != nil && in.AssigneeID != nil && updated.AssigneeID != nil && *updated.AssigneeID != "" && *updated.AssigneeID != actorID {
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: *updated.AssigneeID,
			ActorID:     actorID,
			Type:        model.NotificationTypeTicketAssigned,
			TargetID:    &updated.ID,
			TargetType:  ptrString("support_ticket"),
		})
	}
	if in.Status != nil {
		eventType := model.NotificationTypeTicketStatusChanged
		if updated.Category == model.SupportCategoryFeature {
			eventType = model.NotificationTypeFeatureRequestStateChanged
		}
		s.notifyParticipants(ctx, updated.ID, actorID, eventType)
	}
	s.normalizeUnread(updated)
	return updated, nil
}

func (s *SupportTicketService) AddMessage(ctx context.Context, ticketID, authorID string, in *model.AddSupportTicketMessageInput) (*model.SupportTicketMessage, error) {
	if strings.TrimSpace(in.Body) == "" {
		return nil, ErrSupportBodyEmpty
	}
	ticket, err := s.repo.GetByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	canAccess, err := s.canAccessTicket(ctx, ticket, authorID)
	if err != nil {
		return nil, err
	}
	if !canAccess {
		return nil, ErrNotAdmin
	}
	msg, err := s.repo.AddMessage(ctx, ticketID, authorID, in)
	if err != nil {
		return nil, err
	}
	if !in.InternalNote {
		s.notifyParticipants(ctx, ticketID, authorID, model.NotificationTypeTicketReplied)
	}
	return msg, nil
}

func (s *SupportTicketService) MarkRead(ctx context.Context, ticketID, userID string, in *model.MarkSupportTicketReadInput) error {
	ticket, err := s.repo.GetByID(ctx, ticketID)
	if err != nil {
		return err
	}
	canAccess, err := s.canAccessTicket(ctx, ticket, userID)
	if err != nil {
		return err
	}
	if !canAccess {
		return ErrNotAdmin
	}
	if in == nil {
		return s.repo.MarkRead(ctx, ticketID, userID, nil)
	}
	return s.repo.MarkRead(ctx, ticketID, userID, in.LastReadAt)
}

func (s *SupportTicketService) normalizeUnread(ticket *model.SupportTicket) {
	if ticket == nil {
		return
	}
	ticket.Unread = &model.UnreadState{
		Count:     ticket.UnreadCount,
		HasUnread: ticket.UnreadCount > 0,
	}
}

func (s *SupportTicketService) authorizeRequesterScope(ctx context.Context, requesterID, scopeType string, scopeID *string) error {
	switch scopeType {
	case model.SupportScopePlatform:
		return nil
	case model.SupportScopeLeague:
		if scopeID == nil || *scopeID == "" {
			return ErrSupportInvalidScope
		}
		ok, err := s.leagues.IsMember(ctx, *scopeID, requesterID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotAdmin
		}
	case model.SupportScopeClub:
		if scopeID == nil || *scopeID == "" {
			return ErrSupportInvalidScope
		}
		ok, err := s.clubs.IsMember(ctx, *scopeID, requesterID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotAdmin
		}
	}
	return nil
}

func (s *SupportTicketService) canAccessTicket(ctx context.Context, ticket *model.SupportTicket, userID string) (bool, error) {
	if ticket == nil {
		return false, nil
	}
	if ticket.RequesterID == userID {
		return true, nil
	}
	if _, err := s.repo.GetParticipant(ctx, ticket.ID, userID); err == nil {
		return true, nil
	}
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if user.Role == "admin" {
		return true, nil
	}
	switch ticket.ScopeType {
	case model.SupportScopeLeague:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.leagues.IsAdmin(ctx, *ticket.ScopeID, userID)
	case model.SupportScopeClub:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.clubs.IsAdmin(ctx, *ticket.ScopeID, userID)
	default:
		return false, nil
	}
}

func (s *SupportTicketService) isAdminForTicket(ctx context.Context, ticket *model.SupportTicket, userID string) (bool, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if user.Role == "admin" {
		return true, nil
	}
	switch ticket.ScopeType {
	case model.SupportScopeLeague:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.leagues.IsAdmin(ctx, *ticket.ScopeID, userID)
	case model.SupportScopeClub:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.clubs.IsAdmin(ctx, *ticket.ScopeID, userID)
	default:
		return false, nil
	}
}

func (s *SupportTicketService) notifyParticipants(ctx context.Context, ticketID, actorID, eventType string) {
	if s == nil || s.notifications == nil {
		return
	}
	participants, err := s.repo.ListParticipants(ctx, ticketID)
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
			Type:        eventType,
			TargetID:    &ticketID,
			TargetType:  ptrString("support_ticket"),
		})
	}
}

func (s *SupportTicketService) notifyScopeAdmins(ctx context.Context, ticket *model.SupportTicket, actorID string, eventType string) {
	if s == nil || s.notifications == nil || ticket == nil {
		return
	}
	ids := []string{}
	switch ticket.ScopeType {
	case model.SupportScopeLeague:
		if ticket.ScopeID == nil {
			return
		}
		if out, err := s.leagues.ListAdminIDs(ctx, *ticket.ScopeID); err == nil {
			ids = out
		}
	case model.SupportScopeClub:
		if ticket.ScopeID == nil {
			return
		}
		if out, err := s.clubs.ListAdminIDs(ctx, *ticket.ScopeID); err == nil {
			ids = out
		}
	default:
		return
	}
	for _, recipientID := range ids {
		if recipientID == "" || recipientID == actorID {
			continue
		}
		var leagueID, clubID *string
		if ticket.ScopeType == model.SupportScopeLeague {
			leagueID = ticket.ScopeID
		}
		if ticket.ScopeType == model.SupportScopeClub {
			clubID = ticket.ScopeID
		}
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: recipientID,
			ActorID:     actorID,
			Type:        eventType,
			TargetID:    &ticket.ID,
			TargetType:  ptrString("support_ticket"),
			LeagueID:    leagueID,
			ClubID:      clubID,
		})
	}
}

func ptrString(v string) *string {
	return &v
}

func isValidSupportTransition(fromStatus, toStatus string) bool {
	if fromStatus == toStatus {
		return true
	}
	switch fromStatus {
	case model.SupportStatusOpen:
		return toStatus == model.SupportStatusInProgress || toStatus == model.SupportStatusWaitingOnUser || toStatus == model.SupportStatusResolved || toStatus == model.SupportStatusClosed
	case model.SupportStatusInProgress:
		return toStatus == model.SupportStatusWaitingOnUser || toStatus == model.SupportStatusResolved || toStatus == model.SupportStatusClosed || toStatus == model.SupportStatusOpen
	case model.SupportStatusWaitingOnUser:
		return toStatus == model.SupportStatusInProgress || toStatus == model.SupportStatusResolved || toStatus == model.SupportStatusClosed
	case model.SupportStatusResolved:
		return toStatus == model.SupportStatusClosed || toStatus == model.SupportStatusOpen || toStatus == model.SupportStatusInProgress
	case model.SupportStatusClosed:
		return toStatus == model.SupportStatusOpen
	default:
		return false
	}
}
