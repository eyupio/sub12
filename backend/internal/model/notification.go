package model

import "time"

// NotificationType enumerates supported notification events.
const (
	NotificationTypeFollowRequest      = "follow_request"
	NotificationTypeFollowAccepted     = "follow_accepted"
	NotificationTypeCommentOnCard      = "comment_on_my_card"
	NotificationTypeReplyToMyComment   = "reply_to_my_comment"
	NotificationTypeLikeOnMyContent    = "like_on_my_content"
	NotificationTypeScoreVerified      = "score_verified"
	NotificationTypeScoreRejected      = "score_rejected"
	NotificationTypeScoreAmended       = "score_amended"
	NotificationTypeLeagueJoinApproved = "league_join_approved"
	NotificationTypeClubJoinApproved   = "club_join_approved"
	NotificationTypeMention            = "mention"
)

// Notification is a single delivered in-app notification row.
type Notification struct {
	ID                string         `json:"id"`
	RecipientID       string         `json:"recipient_id"`
	ActorID           *string        `json:"actor_id,omitempty"`
	ActorDisplayName  *string        `json:"actor_display_name,omitempty"`
	ActorAvatarURL    *string        `json:"actor_avatar_url,omitempty"`
	Type              string         `json:"type"`
	TargetID          *string        `json:"target_id,omitempty"`
	TargetType        *string        `json:"target_type,omitempty"`
	LeagueID          *string        `json:"league_id,omitempty"`
	ClubID            *string        `json:"club_id,omitempty"`
	Metadata          map[string]any `json:"metadata,omitempty"`
	ReadAt            *time.Time     `json:"read_at,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
}

// NotificationPreferences holds per-type opt-in flags.
// Missing rows in the DB imply all-defaults-true (see DefaultNotificationPreferences).
type NotificationPreferences struct {
	UserID              string    `json:"user_id"`
	FollowRequest       bool      `json:"follow_request"`
	FollowAccepted      bool      `json:"follow_accepted"`
	CommentOnMyCard     bool      `json:"comment_on_my_card"`
	ReplyToMyComment    bool      `json:"reply_to_my_comment"`
	LikeOnMyContent     bool      `json:"like_on_my_content"`
	ScoreVerified       bool      `json:"score_verified"`
	ScoreRejected       bool      `json:"score_rejected"`
	ScoreAmended        bool      `json:"score_amended"`
	LeagueJoinApproved  bool      `json:"league_join_approved"`
	ClubJoinApproved    bool      `json:"club_join_approved"`
	Mention             bool      `json:"mention"`
	DigestEmail         bool      `json:"digest_email"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// DefaultNotificationPreferences returns the defaults used when no row exists.
func DefaultNotificationPreferences(userID string) *NotificationPreferences {
	return &NotificationPreferences{
		UserID:             userID,
		FollowRequest:      true,
		FollowAccepted:     true,
		CommentOnMyCard:    true,
		ReplyToMyComment:   true,
		LikeOnMyContent:    true,
		ScoreVerified:      true,
		ScoreRejected:      true,
		ScoreAmended:       true,
		LeagueJoinApproved: true,
		ClubJoinApproved:   true,
		Mention:            true,
		DigestEmail:        false,
	}
}

// EnabledForType returns the flag for a given notification type.
func (p *NotificationPreferences) EnabledForType(t string) bool {
	switch t {
	case NotificationTypeFollowRequest:
		return p.FollowRequest
	case NotificationTypeFollowAccepted:
		return p.FollowAccepted
	case NotificationTypeCommentOnCard:
		return p.CommentOnMyCard
	case NotificationTypeReplyToMyComment:
		return p.ReplyToMyComment
	case NotificationTypeLikeOnMyContent:
		return p.LikeOnMyContent
	case NotificationTypeScoreVerified:
		return p.ScoreVerified
	case NotificationTypeScoreRejected:
		return p.ScoreRejected
	case NotificationTypeScoreAmended:
		return p.ScoreAmended
	case NotificationTypeLeagueJoinApproved:
		return p.LeagueJoinApproved
	case NotificationTypeClubJoinApproved:
		return p.ClubJoinApproved
	case NotificationTypeMention:
		return p.Mention
	}
	return true
}

// UpdateNotificationPrefsInput is the PATCH payload for preferences.
type UpdateNotificationPrefsInput struct {
	FollowRequest       *bool `json:"follow_request,omitempty"`
	FollowAccepted      *bool `json:"follow_accepted,omitempty"`
	CommentOnMyCard     *bool `json:"comment_on_my_card,omitempty"`
	ReplyToMyComment    *bool `json:"reply_to_my_comment,omitempty"`
	LikeOnMyContent     *bool `json:"like_on_my_content,omitempty"`
	ScoreVerified       *bool `json:"score_verified,omitempty"`
	ScoreRejected       *bool `json:"score_rejected,omitempty"`
	ScoreAmended        *bool `json:"score_amended,omitempty"`
	LeagueJoinApproved  *bool `json:"league_join_approved,omitempty"`
	ClubJoinApproved    *bool `json:"club_join_approved,omitempty"`
	Mention             *bool `json:"mention,omitempty"`
	DigestEmail         *bool `json:"digest_email,omitempty"`
}
