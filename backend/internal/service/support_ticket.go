package service

import (
	"context"
	"errors"
	"fmt"
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
	emailSender   *EmailSenderService
	frontendURL   string
}

func NewSupportTicketService(
	repo *repository.SupportTicketRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	users *repository.UserRepository,
	notifications *NotificationService,
	emailSender *EmailSenderService,
	frontendURL string,
) *SupportTicketService {
	return &SupportTicketService{
		repo:          repo,
		leagues:       leagues,
		clubs:         clubs,
		users:         users,
		notifications: notifications,
		emailSender:   emailSender,
		frontendURL:   strings.TrimRight(frontendURL, "/"),
	}
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
	s.sendTicketCreatedConfirmationEmail(ctx, ticket)
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
	viewer, err := s.users.GetByID(ctx, viewerID)
	if err != nil {
		return nil, err
	}
	isAdmin := viewer.Role == "admin"
	allowed := make([]*model.SupportTicket, 0, len(items))
	for _, item := range items {
		ok, err := s.canAccessTicketAsRole(ctx, item, viewerID, isAdmin)
		if err != nil {
			return nil, err
		}
		if ok {
			allowed = append(allowed, item)
		}
	}
	return allowed, nil
}

// UnreadCount returns the total unread ticket-message count for the user.
func (s *SupportTicketService) UnreadCount(ctx context.Context, userID string) (int, error) {
	return s.repo.UnreadCount(ctx, userID)
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
	isAdmin, err := s.isAdminForTicket(ctx, ticket, actorID)
	if err != nil {
		return nil, err
	}
	if !isAdmin && ticket.RequesterID == actorID {
		if in.AssigneeID != nil || in.Priority != nil || in.Category != nil {
			return nil, ErrNotAdmin
		}
		if in.Status != nil && *in.Status != model.SupportStatusOpen && *in.Status != model.SupportStatusClosed {
			return nil, ErrNotAdmin
		}
	}
	if !isAdmin && (in.AssigneeID != nil || in.Priority != nil || in.Category != nil) {
		return nil, ErrNotAdmin
	}
	if in.Title != nil && strings.TrimSpace(*in.Title) == "" {
		return nil, ErrSupportTitleEmpty
	}
	if in.Description != nil && strings.TrimSpace(*in.Description) == "" {
		return nil, ErrSupportBodyEmpty
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
		s.sendTicketAssignedEmail(ctx, updated, actorID)
	}
	if in.Status != nil {
		eventType := model.NotificationTypeTicketStatusChanged
		if updated.Category == model.SupportCategoryFeature {
			eventType = model.NotificationTypeFeatureRequestStateChanged
		}
		s.notifyParticipants(ctx, updated.ID, actorID, eventType)
		s.sendTicketStatusChangedEmails(ctx, updated, actorID, ticket.Status, *in.Status)
	}
	s.normalizeUnread(updated)
	return updated, nil
}

func (s *SupportTicketService) Delete(ctx context.Context, id, actorID string) error {
	ticket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	isAdmin, err := s.isAdminForTicket(ctx, ticket, actorID)
	if err != nil {
		return err
	}
	if !isAdmin && ticket.RequesterID != actorID {
		return ErrNotAdmin
	}
	return s.repo.Delete(ctx, id)
}

func (s *SupportTicketService) AdminDelete(ctx context.Context, id, actorID string) error {
	ticket, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	isAdmin, err := s.isAdminForTicket(ctx, ticket, actorID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNotAdmin
	}
	return s.repo.Delete(ctx, id)
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
		s.sendTicketReplyEmails(ctx, ticket, authorID)
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
	return s.canAccessTicketAsRole(ctx, ticket, userID, user.Role == "admin")
}

// canAccessTicketAsRole is canAccessTicket with the viewer's admin status
// already resolved, so a caller checking many tickets for the same viewer
// (List) can fetch that viewer's user row once instead of once per ticket.
func (s *SupportTicketService) canAccessTicketAsRole(ctx context.Context, ticket *model.SupportTicket, userID string, isAdmin bool) (bool, error) {
	if ticket == nil {
		return false, nil
	}
	if ticket.RequesterID == userID {
		return true, nil
	}
	if _, err := s.repo.GetParticipant(ctx, ticket.ID, userID); err == nil {
		return true, nil
	}
	if isAdmin {
		return true, nil
	}
	switch ticket.ScopeType {
	case model.SupportScopeLeague:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.leagues.Can(ctx, *ticket.ScopeID, userID, model.PermManageSupport)
	case model.SupportScopeClub:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.clubs.Can(ctx, *ticket.ScopeID, userID, model.PermManageSupport)
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
		return s.leagues.Can(ctx, *ticket.ScopeID, userID, model.PermManageSupport)
	case model.SupportScopeClub:
		if ticket.ScopeID == nil {
			return false, nil
		}
		return s.clubs.Can(ctx, *ticket.ScopeID, userID, model.PermManageSupport)
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

func (s *SupportTicketService) sendTicketCreatedConfirmationEmail(ctx context.Context, ticket *model.SupportTicket) {
	if s == nil || s.emailSender == nil || s.notifications == nil || ticket == nil || ticket.RequesterID == "" {
		return
	}
	if !s.shouldSendTicketEmail(ctx, ticket.RequesterID, model.NotificationTypeTicketCreated) {
		return
	}
	user, err := s.users.GetByID(ctx, ticket.RequesterID)
	if err != nil || user.Email == "" {
		return
	}
	_ = s.emailSender.SendTicketCreatedConfirmation(
		ctx,
		user.Email,
		user.DisplayName,
		ticket.ID,
		ticket.Title,
		s.ticketDetailLink(ticket.ID),
	)
}

func (s *SupportTicketService) sendTicketReplyEmails(ctx context.Context, ticket *model.SupportTicket, actorID string) {
	if s == nil || s.emailSender == nil || s.notifications == nil || ticket == nil {
		return
	}
	participants, err := s.repo.ListParticipants(ctx, ticket.ID)
	if err != nil {
		return
	}
	actorName := s.lookupActorName(ctx, actorID)
	for _, p := range participants {
		if p.UserID == "" || p.UserID == actorID {
			continue
		}
		if !s.shouldSendTicketEmail(ctx, p.UserID, model.NotificationTypeTicketReplied) {
			continue
		}
		user, err := s.users.GetByID(ctx, p.UserID)
		if err != nil || user.Email == "" {
			continue
		}
		_ = s.emailSender.SendTicketNewReply(
			ctx,
			user.Email,
			user.DisplayName,
			actorName,
			ticket.ID,
			ticket.Title,
			s.ticketDetailLink(ticket.ID),
		)
	}
}

func (s *SupportTicketService) sendTicketAssignedEmail(ctx context.Context, ticket *model.SupportTicket, actorID string) {
	if s == nil || s.emailSender == nil || s.notifications == nil || ticket == nil || ticket.AssigneeID == nil || *ticket.AssigneeID == "" {
		return
	}
	assigneeID := *ticket.AssigneeID
	if !s.shouldSendTicketEmail(ctx, assigneeID, model.NotificationTypeTicketAssigned) {
		return
	}
	assignee, err := s.users.GetByID(ctx, assigneeID)
	if err != nil || assignee.Email == "" {
		return
	}
	_ = s.emailSender.SendTicketAssigned(
		ctx,
		assignee.Email,
		assignee.DisplayName,
		s.lookupActorName(ctx, actorID),
		ticket.ID,
		ticket.Title,
		s.ticketDetailLink(ticket.ID),
	)
}

func (s *SupportTicketService) sendTicketStatusChangedEmails(ctx context.Context, ticket *model.SupportTicket, actorID, fromStatus, toStatus string) {
	if s == nil || s.emailSender == nil || s.notifications == nil || ticket == nil {
		return
	}
	participants, err := s.repo.ListParticipants(ctx, ticket.ID)
	if err != nil {
		return
	}
	actorName := s.lookupActorName(ctx, actorID)
	eventType := model.NotificationTypeTicketStatusChanged
	isFeatureAccepted := ticket.Category == model.SupportCategoryFeature && toStatus == model.SupportStatusInProgress
	if ticket.Category == model.SupportCategoryFeature {
		eventType = model.NotificationTypeFeatureRequestStateChanged
	}
	for _, p := range participants {
		if p.UserID == "" || p.UserID == actorID {
			continue
		}
		if !s.shouldSendTicketEmail(ctx, p.UserID, eventType) {
			continue
		}
		user, err := s.users.GetByID(ctx, p.UserID)
		if err != nil || user.Email == "" {
			continue
		}
		ticketLink := s.ticketDetailLink(ticket.ID)
		if isFeatureAccepted {
			_ = s.emailSender.SendFeatureRequestAcceptedForRefinement(
				ctx,
				user.Email,
				user.DisplayName,
				actorName,
				ticket.ID,
				ticket.Title,
				humanizeTicketStatus(toStatus),
				ticketLink,
			)
			continue
		}
		_ = s.emailSender.SendTicketStatusChanged(
			ctx,
			user.Email,
			user.DisplayName,
			actorName,
			ticket.ID,
			ticket.Title,
			humanizeTicketStatus(fromStatus),
			humanizeTicketStatus(toStatus),
			ticketLink,
		)
	}
}

func (s *SupportTicketService) shouldSendTicketEmail(ctx context.Context, userID, notificationType string) bool {
	prefs, err := s.notifications.GetPreferences(ctx, userID)
	if err != nil {
		prefs = model.DefaultNotificationPreferences(userID)
	}
	return prefs.EmailEnabledForType(notificationType)
}

func (s *SupportTicketService) lookupActorName(ctx context.Context, actorID string) string {
	if actorID == "" {
		return "Someone"
	}
	user, err := s.users.GetByID(ctx, actorID)
	if err != nil || strings.TrimSpace(user.DisplayName) == "" {
		return "Someone"
	}
	return user.DisplayName
}

func (s *SupportTicketService) ticketDetailLink(ticketID string) string {
	if strings.TrimSpace(s.frontendURL) == "" {
		return fmt.Sprintf("/support/tickets/%s", ticketID)
	}
	return fmt.Sprintf("%s/support/tickets/%s", s.frontendURL, ticketID)
}

func humanizeTicketStatus(status string) string {
	switch status {
	case model.SupportStatusOpen:
		return "Open"
	case model.SupportStatusInProgress:
		return "In progress"
	case model.SupportStatusWaitingOnUser:
		return "Waiting on user"
	case model.SupportStatusResolved:
		return "Resolved"
	case model.SupportStatusClosed:
		return "Closed"
	default:
		return status
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
