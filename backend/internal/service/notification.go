package service

import (
	"context"
	"errors"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// NotificationService coordinates fan-out and read access for in-app notifications.
type NotificationService struct {
	repo    *repository.NotificationRepository
	blocks  *repository.BlockRepository
	mutes   *repository.MuteRepository
	users   *repository.UserRepository
	emailer *EmailSenderService
	devices *repository.DeviceRepository
	push    PushSender
	logger  zerolog.Logger
}

func NewNotificationService(
	repo *repository.NotificationRepository,
	blocks *repository.BlockRepository,
	mutes *repository.MuteRepository,
	users *repository.UserRepository,
	emailer *EmailSenderService,
	logger zerolog.Logger,
) *NotificationService {
	return &NotificationService{repo: repo, blocks: blocks, mutes: mutes, users: users, emailer: emailer, logger: logger}
}

// SetPush wires the device registry and push transport used for push fan-out.
// Optional — when unset (or set to a NoopPushSender) notifications still fan out
// in-app and via email; only push delivery is skipped. Mirrors the SetX wiring
// used elsewhere so the constructor signature stays stable.
func (s *NotificationService) SetPush(devices *repository.DeviceRepository, sender PushSender) {
	s.devices = devices
	s.push = sender
}

// NotifEvent is the input to Fanout. One Fanout call produces one notification
// row (no de-duplication — callers decide).
type NotifEvent struct {
	RecipientID string
	ActorID     string
	Type        string
	TargetID    *string
	TargetType  *string
	LeagueID    *string
	ClubID      *string
	Metadata    map[string]any
}

// Fanout inserts a notification row for a single recipient, respecting their
// preferences, blocks and mutes. Self-notifications are silently dropped.
// Errors are logged but never returned to callers — a failed notification must
// never prevent the user-facing action from succeeding.
//
// When the recipient has opted in to email for the event type, an email is
// also dispatched asynchronously on a background context.
func (s *NotificationService) Fanout(ctx context.Context, ev NotifEvent) {
	if s == nil || s.repo == nil {
		return
	}
	if ev.RecipientID == "" || ev.Type == "" {
		return
	}
	if ev.ActorID == ev.RecipientID {
		return
	}

	// Respect blocks in both directions and mutes from recipient → actor.
	if ev.ActorID != "" && s.blocks != nil {
		if blocked, err := s.blocks.IsBlocked(ctx, ev.RecipientID, ev.ActorID); err == nil && blocked {
			return
		}
		if blocked, err := s.blocks.IsBlocked(ctx, ev.ActorID, ev.RecipientID); err == nil && blocked {
			return
		}
	}
	if ev.ActorID != "" && s.mutes != nil {
		if muted, err := s.mutes.IsMuted(ctx, ev.RecipientID, ev.ActorID); err == nil && muted {
			return
		}
	}

	prefs, err := s.repo.GetPreferences(ctx, ev.RecipientID)
	if err != nil {
		s.logger.Warn().Err(err).Str("recipient_id", ev.RecipientID).Msg("fetch notification prefs failed, using defaults")
		prefs = model.DefaultNotificationPreferences(ev.RecipientID)
	}
	if !prefs.EnabledForType(ev.Type) {
		return
	}

	n := &model.Notification{
		RecipientID: ev.RecipientID,
		Type:        ev.Type,
		TargetID:    ev.TargetID,
		TargetType:  ev.TargetType,
		LeagueID:    ev.LeagueID,
		ClubID:      ev.ClubID,
		Metadata:    ev.Metadata,
	}
	if ev.ActorID != "" {
		actor := ev.ActorID
		n.ActorID = &actor
	}
	if err := s.repo.Insert(ctx, n); err != nil {
		s.logger.Warn().Err(err).Str("type", ev.Type).Str("recipient_id", ev.RecipientID).Msg("insert notification failed")
	}

	// Push fan-out mirrors the in-app enablement gate above (we only reach here
	// for types the recipient has enabled). Best-effort — never affects the
	// user-facing action.
	s.pushFanout(ctx, ev)

	if !prefs.EmailEnabledForType(ev.Type) {
		return
	}
	if isTicketNotificationType(ev.Type) {
		// Ticket-related emails are rendered by SupportTicketService using
		// ticket-specific templates instead of notification_generic.
		return
	}
	if s.users == nil || s.emailer == nil {
		return
	}
	recipient, err := s.users.GetByID(ctx, ev.RecipientID)
	if err != nil {
		s.logger.Warn().Err(err).Str("recipient_id", ev.RecipientID).Msg("load recipient for notification email failed")
		return
	}
	actorName := ""
	if ev.ActorID != "" {
		if a, err := s.users.GetByID(ctx, ev.ActorID); err == nil {
			actorName = a.DisplayName
		}
	}
	subject, body := notificationEmailContent(ev, actorName)
	go func(toEmail, displayName, subject, body, evType string) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.emailer.SendNotification(bgCtx, toEmail, displayName, subject, body); err != nil {
			s.logger.Warn().Err(err).Str("type", evType).Msg("send notification email failed")
		}
	}(recipient.Email, recipient.DisplayName, subject, body, ev.Type)
}

// pushFanout delivers a push notification for the event to the recipient's
// registered devices. No-ops when push isn't wired or the recipient has no
// devices. Delivery is handed to the PushSender, which is responsible for its
// own async/best-effort behaviour.
func (s *NotificationService) pushFanout(ctx context.Context, ev NotifEvent) {
	if s.push == nil || s.devices == nil {
		return
	}
	tokens, err := s.devices.ListTokensByUser(ctx, ev.RecipientID)
	if err != nil {
		s.logger.Warn().Err(err).Str("recipient_id", ev.RecipientID).Msg("load device tokens for push failed")
		return
	}
	if len(tokens) == 0 {
		return
	}
	actorName := ""
	if ev.ActorID != "" && s.users != nil {
		if a, err := s.users.GetByID(ctx, ev.ActorID); err == nil {
			actorName = a.DisplayName
		}
	}
	title, body := notificationEmailContent(ev, actorName)
	data := map[string]string{"type": ev.Type}
	if ev.TargetID != nil {
		data["target_id"] = *ev.TargetID
	}
	if ev.TargetType != nil {
		data["target_type"] = *ev.TargetType
	}
	s.push.Send(ctx, tokens, PushMessage{Title: title, Body: body, Data: data})
}

func isTicketNotificationType(t string) bool {
	switch t {
	case model.NotificationTypeTicketCreated,
		model.NotificationTypeTicketReplied,
		model.NotificationTypeTicketAssigned,
		model.NotificationTypeTicketStatusChanged,
		model.NotificationTypeFeatureRequestStateChanged:
		return true
	default:
		return false
	}
}

// notificationEmailContent maps a NotifEvent to a user-facing email subject
// and a single-sentence notification body. Unknown types fall back to a
// generic message.
func notificationEmailContent(ev NotifEvent, actorName string) (subject, body string) {
	actor := actorName
	if actor == "" {
		actor = "Someone"
	}
	switch ev.Type {
	case model.NotificationTypeFollowRequest:
		return "New follow request on sub12.io", actor + " wants to follow you on sub12.io."
	case model.NotificationTypeFollowAccepted:
		return "New follower on sub12.io", actor + " is now following you on sub12.io."
	case model.NotificationTypeCommentOnCard:
		return "New comment on your score card", actor + " commented on your score card."
	case model.NotificationTypeReplyToMyComment:
		return "New reply to your comment", actor + " replied to your comment."
	case model.NotificationTypeLikeOnMyContent:
		return "Someone liked your content", actor + " liked your content on sub12.io."
	case model.NotificationTypeScoreVerified:
		return "Your score was verified", "Your score card was verified."
	case model.NotificationTypeScoreRejected:
		body := "A league admin rejected your score card."
		if reason, ok := ev.Metadata["reason"].(string); ok && reason != "" {
			body = "A league admin rejected your score card. Reason: " + reason
		}
		return "Your score was rejected", body
	case model.NotificationTypeScoreAmended:
		return "Your score was amended", "A league admin amended your score card."
	case model.NotificationTypeLeagueJoinApproved:
		return "League join approved", "Your request to join a league was approved."
	case model.NotificationTypeClubJoinApproved:
		return "Club join approved", "Your request to join a club was approved."
	case model.NotificationTypeMention:
		return "You were mentioned on sub12.io", actor + " mentioned you on sub12.io."
	case model.NotificationTypePostFlagged:
		return "A moderator flagged your post", "A moderator flagged your post and asked you to reflect and edit to amend. Editing your post clears the flag."
	case model.NotificationTypeTicketCreated:
		return "New support ticket", actor + " created a support ticket."
	case model.NotificationTypeTicketReplied:
		return "New reply on a support ticket", actor + " replied on a support ticket you're involved in."
	case model.NotificationTypeTicketAssigned:
		return "Support ticket assigned to you", actor + " assigned a support ticket to you."
	case model.NotificationTypeTicketStatusChanged:
		return "Support ticket status updated", actor + " updated a support ticket status."
	case model.NotificationTypeFeatureRequestStateChanged:
		return "Feature request status updated", actor + " updated the state of a feature request."
	}
	return "New sub12.io notification", "You have a new notification on sub12.io."
}

// List returns a page of notifications for the recipient.
func (s *NotificationService) List(ctx context.Context, recipientID string, limit int, cursor string) ([]*model.Notification, string, error) {
	return s.repo.ListForUser(ctx, recipientID, limit, cursor)
}

// UnreadCount returns the number of unread notifications for the recipient.
func (s *NotificationService) UnreadCount(ctx context.Context, recipientID string) (int, error) {
	return s.repo.UnreadCount(ctx, recipientID)
}

// MarkRead marks the specified ids read, or all unread when ids is empty.
func (s *NotificationService) MarkRead(ctx context.Context, recipientID string, ids []string) error {
	return s.repo.MarkRead(ctx, recipientID, ids)
}

// GetPreferences returns the user's notification preferences.
func (s *NotificationService) GetPreferences(ctx context.Context, userID string) (*model.NotificationPreferences, error) {
	return s.repo.GetPreferences(ctx, userID)
}

// UpdatePreferences applies a patch to the user's notification preferences.
func (s *NotificationService) UpdatePreferences(ctx context.Context, userID string, in *model.UpdateNotificationPrefsInput) (*model.NotificationPreferences, error) {
	if in == nil {
		return nil, errors.New("no updates provided")
	}
	return s.repo.UpsertPreferences(ctx, userID, in)
}
