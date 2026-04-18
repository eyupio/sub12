package model

import "time"

// NotificationType enumerates supported notification events.
const (
	NotificationTypeFollowRequest              = "follow_request"
	NotificationTypeFollowAccepted             = "follow_accepted"
	NotificationTypeCommentOnCard              = "comment_on_my_card"
	NotificationTypeReplyToMyComment           = "reply_to_my_comment"
	NotificationTypeLikeOnMyContent            = "like_on_my_content"
	NotificationTypeScoreVerified              = "score_verified"
	NotificationTypeScoreRejected              = "score_rejected"
	NotificationTypeScoreAmended               = "score_amended"
	NotificationTypeLeagueJoinApproved         = "league_join_approved"
	NotificationTypeClubJoinApproved           = "club_join_approved"
	NotificationTypeMention                    = "mention"
	NotificationTypeReportFiled                = "report_filed"
	NotificationTypeTicketCreated              = "ticket_created"
	NotificationTypeTicketReplied              = "ticket_replied"
	NotificationTypeTicketAssigned             = "ticket_assigned"
	NotificationTypeTicketStatusChanged        = "ticket_status_changed"
	NotificationTypeFeatureRequestStateChanged = "feature_request_state_changed"
)

// Notification is a single delivered in-app notification row.
type Notification struct {
	ID               string         `json:"id"`
	RecipientID      string         `json:"recipient_id"`
	ActorID          *string        `json:"actor_id,omitempty"`
	ActorDisplayName *string        `json:"actor_display_name,omitempty"`
	ActorAvatarURL   *string        `json:"actor_avatar_url,omitempty"`
	Type             string         `json:"type"`
	TargetID         *string        `json:"target_id,omitempty"`
	TargetType       *string        `json:"target_type,omitempty"`
	LeagueID         *string        `json:"league_id,omitempty"`
	ClubID           *string        `json:"club_id,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
	ReadAt           *time.Time     `json:"read_at,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
}

// NotificationPreferences holds per-type opt-in flags. The base flags gate
// in-app delivery; the *_email flags gate email delivery for the same type.
// Missing rows in the DB imply all in-app defaults true and all email defaults
// false (see DefaultNotificationPreferences). report_filed email delivery is
// gated by DigestEmail and handled by ModerationService directly.
type NotificationPreferences struct {
	UserID                          string    `json:"user_id"`
	FollowRequest                   bool      `json:"follow_request"`
	FollowAccepted                  bool      `json:"follow_accepted"`
	CommentOnMyCard                 bool      `json:"comment_on_my_card"`
	ReplyToMyComment                bool      `json:"reply_to_my_comment"`
	LikeOnMyContent                 bool      `json:"like_on_my_content"`
	ScoreVerified                   bool      `json:"score_verified"`
	ScoreRejected                   bool      `json:"score_rejected"`
	ScoreAmended                    bool      `json:"score_amended"`
	LeagueJoinApproved              bool      `json:"league_join_approved"`
	ClubJoinApproved                bool      `json:"club_join_approved"`
	Mention                         bool      `json:"mention"`
	ReportFiled                     bool      `json:"report_filed"`
	TicketCreated                   bool      `json:"ticket_created"`
	TicketReplied                   bool      `json:"ticket_replied"`
	TicketAssigned                  bool      `json:"ticket_assigned"`
	TicketStatusChanged             bool      `json:"ticket_status_changed"`
	FeatureRequestStateChanged      bool      `json:"feature_request_state_changed"`
	DigestEmail                     bool      `json:"digest_email"`
	FollowRequestEmail              bool      `json:"follow_request_email"`
	FollowAcceptedEmail             bool      `json:"follow_accepted_email"`
	CommentOnMyCardEmail            bool      `json:"comment_on_my_card_email"`
	ReplyToMyCommentEmail           bool      `json:"reply_to_my_comment_email"`
	LikeOnMyContentEmail            bool      `json:"like_on_my_content_email"`
	ScoreVerifiedEmail              bool      `json:"score_verified_email"`
	ScoreRejectedEmail              bool      `json:"score_rejected_email"`
	ScoreAmendedEmail               bool      `json:"score_amended_email"`
	LeagueJoinApprovedEmail         bool      `json:"league_join_approved_email"`
	ClubJoinApprovedEmail           bool      `json:"club_join_approved_email"`
	MentionEmail                    bool      `json:"mention_email"`
	TicketCreatedEmail              bool      `json:"ticket_created_email"`
	TicketRepliedEmail              bool      `json:"ticket_replied_email"`
	TicketAssignedEmail             bool      `json:"ticket_assigned_email"`
	TicketStatusChangedEmail        bool      `json:"ticket_status_changed_email"`
	FeatureRequestStateChangedEmail bool      `json:"feature_request_state_changed_email"`
	UpdatedAt                       time.Time `json:"updated_at"`
}

// DefaultNotificationPreferences returns the defaults used when no row exists.
func DefaultNotificationPreferences(userID string) *NotificationPreferences {
	return &NotificationPreferences{
		UserID:                     userID,
		FollowRequest:              true,
		FollowAccepted:             true,
		CommentOnMyCard:            true,
		ReplyToMyComment:           true,
		LikeOnMyContent:            true,
		ScoreVerified:              true,
		ScoreRejected:              true,
		ScoreAmended:               true,
		LeagueJoinApproved:         true,
		ClubJoinApproved:           true,
		Mention:                    true,
		ReportFiled:                true,
		TicketCreated:              true,
		TicketReplied:              true,
		TicketAssigned:             true,
		TicketStatusChanged:        true,
		FeatureRequestStateChanged: true,
		DigestEmail:                false,
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
	case NotificationTypeReportFiled:
		return p.ReportFiled
	case NotificationTypeTicketCreated:
		return p.TicketCreated
	case NotificationTypeTicketReplied:
		return p.TicketReplied
	case NotificationTypeTicketAssigned:
		return p.TicketAssigned
	case NotificationTypeTicketStatusChanged:
		return p.TicketStatusChanged
	case NotificationTypeFeatureRequestStateChanged:
		return p.FeatureRequestStateChanged
	}
	return true
}

// EmailEnabledForType returns whether the user wants email for a given type.
// Unknown types return false (email is opt-in). report_filed has its own
// dedicated email path in ModerationService gated by DigestEmail, so it is
// intentionally absent from this switch.
func (p *NotificationPreferences) EmailEnabledForType(t string) bool {
	switch t {
	case NotificationTypeFollowRequest:
		return p.FollowRequestEmail
	case NotificationTypeFollowAccepted:
		return p.FollowAcceptedEmail
	case NotificationTypeCommentOnCard:
		return p.CommentOnMyCardEmail
	case NotificationTypeReplyToMyComment:
		return p.ReplyToMyCommentEmail
	case NotificationTypeLikeOnMyContent:
		return p.LikeOnMyContentEmail
	case NotificationTypeScoreVerified:
		return p.ScoreVerifiedEmail
	case NotificationTypeScoreRejected:
		return p.ScoreRejectedEmail
	case NotificationTypeScoreAmended:
		return p.ScoreAmendedEmail
	case NotificationTypeLeagueJoinApproved:
		return p.LeagueJoinApprovedEmail
	case NotificationTypeClubJoinApproved:
		return p.ClubJoinApprovedEmail
	case NotificationTypeMention:
		return p.MentionEmail
	case NotificationTypeTicketCreated:
		return p.TicketCreatedEmail
	case NotificationTypeTicketReplied:
		return p.TicketRepliedEmail
	case NotificationTypeTicketAssigned:
		return p.TicketAssignedEmail
	case NotificationTypeTicketStatusChanged:
		return p.TicketStatusChangedEmail
	case NotificationTypeFeatureRequestStateChanged:
		return p.FeatureRequestStateChangedEmail
	}
	return false
}

// UpdateNotificationPrefsInput is the PATCH payload for preferences.
type UpdateNotificationPrefsInput struct {
	FollowRequest                   *bool `json:"follow_request,omitempty"`
	FollowAccepted                  *bool `json:"follow_accepted,omitempty"`
	CommentOnMyCard                 *bool `json:"comment_on_my_card,omitempty"`
	ReplyToMyComment                *bool `json:"reply_to_my_comment,omitempty"`
	LikeOnMyContent                 *bool `json:"like_on_my_content,omitempty"`
	ScoreVerified                   *bool `json:"score_verified,omitempty"`
	ScoreRejected                   *bool `json:"score_rejected,omitempty"`
	ScoreAmended                    *bool `json:"score_amended,omitempty"`
	LeagueJoinApproved              *bool `json:"league_join_approved,omitempty"`
	ClubJoinApproved                *bool `json:"club_join_approved,omitempty"`
	Mention                         *bool `json:"mention,omitempty"`
	ReportFiled                     *bool `json:"report_filed,omitempty"`
	TicketCreated                   *bool `json:"ticket_created,omitempty"`
	TicketReplied                   *bool `json:"ticket_replied,omitempty"`
	TicketAssigned                  *bool `json:"ticket_assigned,omitempty"`
	TicketStatusChanged             *bool `json:"ticket_status_changed,omitempty"`
	FeatureRequestStateChanged      *bool `json:"feature_request_state_changed,omitempty"`
	DigestEmail                     *bool `json:"digest_email,omitempty"`
	FollowRequestEmail              *bool `json:"follow_request_email,omitempty"`
	FollowAcceptedEmail             *bool `json:"follow_accepted_email,omitempty"`
	CommentOnMyCardEmail            *bool `json:"comment_on_my_card_email,omitempty"`
	ReplyToMyCommentEmail           *bool `json:"reply_to_my_comment_email,omitempty"`
	LikeOnMyContentEmail            *bool `json:"like_on_my_content_email,omitempty"`
	ScoreVerifiedEmail              *bool `json:"score_verified_email,omitempty"`
	ScoreRejectedEmail              *bool `json:"score_rejected_email,omitempty"`
	ScoreAmendedEmail               *bool `json:"score_amended_email,omitempty"`
	LeagueJoinApprovedEmail         *bool `json:"league_join_approved_email,omitempty"`
	ClubJoinApprovedEmail           *bool `json:"club_join_approved_email,omitempty"`
	MentionEmail                    *bool `json:"mention_email,omitempty"`
	TicketCreatedEmail              *bool `json:"ticket_created_email,omitempty"`
	TicketRepliedEmail              *bool `json:"ticket_replied_email,omitempty"`
	TicketAssignedEmail             *bool `json:"ticket_assigned_email,omitempty"`
	TicketStatusChangedEmail        *bool `json:"ticket_status_changed_email,omitempty"`
	FeatureRequestStateChangedEmail *bool `json:"feature_request_state_changed_email,omitempty"`
}
