package service

import (
	"context"
	"errors"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// NotificationService coordinates fan-out and read access for in-app notifications.
type NotificationService struct {
	repo    *repository.NotificationRepository
	blocks  *repository.BlockRepository
	mutes   *repository.MuteRepository
	logger  zerolog.Logger
}

func NewNotificationService(repo *repository.NotificationRepository, blocks *repository.BlockRepository, mutes *repository.MuteRepository, logger zerolog.Logger) *NotificationService {
	return &NotificationService{repo: repo, blocks: blocks, mutes: mutes, logger: logger}
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
