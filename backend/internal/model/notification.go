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
	NotificationTypePostFlagged                = "post_flagged"
	NotificationTypeReportFiled                = "report_filed"
	NotificationTypeTicketCreated              = "ticket_created"
	NotificationTypeTicketReplied              = "ticket_replied"
	NotificationTypeTicketAssigned             = "ticket_assigned"
	NotificationTypeTicketStatusChanged        = "ticket_status_changed"
	NotificationTypeFeatureRequestStateChanged = "feature_request_state_changed"
	NotificationTypeScoreValidationRequested   = "score_validation_requested"
	NotificationTypeLeagueJoinRequest          = "league_join_request"
	NotificationTypeLeagueJoinRejected         = "league_join_rejected"
	NotificationTypeLeagueRoleChanged          = "league_role_changed"
	NotificationTypeLeagueRoundOpened          = "league_round_opened"
	NotificationTypeClubJoinRequest            = "club_join_request"
	NotificationTypeClubJoinRejected           = "club_join_rejected"
	NotificationTypeClubRoleChanged            = "club_role_changed"
	NotificationTypeEventInvitation            = "event_invitation"
	NotificationTypeEventParticipantJoined     = "event_participant_joined"
	NotificationTypeEventWentLive              = "event_went_live"
	NotificationTypeEventResultsPosted         = "event_results_posted"
	NotificationTypeAnnouncement               = "announcement"
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
// Missing rows in the DB imply all in-app and email defaults true
// (see DefaultNotificationPreferences). report_filed email delivery is
// gated by DigestEmail and handled by ModerationService directly.
type NotificationPreferences struct {
	UserID                     string `json:"user_id"`
	FollowRequest              bool   `json:"follow_request"`
	FollowAccepted             bool   `json:"follow_accepted"`
	CommentOnMyCard            bool   `json:"comment_on_my_card"`
	ReplyToMyComment           bool   `json:"reply_to_my_comment"`
	LikeOnMyContent            bool   `json:"like_on_my_content"`
	ScoreVerified              bool   `json:"score_verified"`
	ScoreRejected              bool   `json:"score_rejected"`
	ScoreAmended               bool   `json:"score_amended"`
	LeagueJoinApproved         bool   `json:"league_join_approved"`
	ClubJoinApproved           bool   `json:"club_join_approved"`
	Mention                    bool   `json:"mention"`
	PostFlagged                bool   `json:"post_flagged"`
	ReportFiled                bool   `json:"report_filed"`
	TicketCreated              bool   `json:"ticket_created"`
	TicketReplied              bool   `json:"ticket_replied"`
	TicketAssigned             bool   `json:"ticket_assigned"`
	TicketStatusChanged        bool   `json:"ticket_status_changed"`
	FeatureRequestStateChanged bool   `json:"feature_request_state_changed"`
	ScoreValidationRequested   bool   `json:"score_validation_requested"`
	LeagueJoinRequest          bool   `json:"league_join_request"`
	LeagueJoinRejected         bool   `json:"league_join_rejected"`
	LeagueRoleChanged          bool   `json:"league_role_changed"`
	LeagueRoundOpened          bool   `json:"league_round_opened"`
	ClubJoinRequest            bool   `json:"club_join_request"`
	ClubJoinRejected           bool   `json:"club_join_rejected"`
	ClubRoleChanged            bool   `json:"club_role_changed"`
	EventInvitation            bool   `json:"event_invitation"`
	EventParticipantJoined     bool   `json:"event_participant_joined"`
	EventWentLive              bool   `json:"event_went_live"`
	EventResultsPosted         bool   `json:"event_results_posted"`
	Announcement               bool   `json:"announcement"`
	// The review_requests_* flags widen the audience of a validation request
	// rather than gating delivery of one: they are how a shooter volunteers to
	// be asked to check other people's cards. All three are opt-in.
	ReviewRequestsPublic            bool      `json:"review_requests_public"`
	ReviewRequestsLeagues           bool      `json:"review_requests_leagues"`
	ReviewRequestsClubLeagues       bool      `json:"review_requests_club_leagues"`
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
	PostFlaggedEmail                bool      `json:"post_flagged_email"`
	TicketCreatedEmail              bool      `json:"ticket_created_email"`
	TicketRepliedEmail              bool      `json:"ticket_replied_email"`
	TicketAssignedEmail             bool      `json:"ticket_assigned_email"`
	TicketStatusChangedEmail        bool      `json:"ticket_status_changed_email"`
	FeatureRequestStateChangedEmail bool      `json:"feature_request_state_changed_email"`
	ScoreValidationRequestedEmail   bool      `json:"score_validation_requested_email"`
	LeagueJoinRequestEmail          bool      `json:"league_join_request_email"`
	LeagueJoinRejectedEmail         bool      `json:"league_join_rejected_email"`
	LeagueRoleChangedEmail          bool      `json:"league_role_changed_email"`
	LeagueRoundOpenedEmail          bool      `json:"league_round_opened_email"`
	ClubJoinRequestEmail            bool      `json:"club_join_request_email"`
	ClubJoinRejectedEmail           bool      `json:"club_join_rejected_email"`
	ClubRoleChangedEmail            bool      `json:"club_role_changed_email"`
	EventInvitationEmail            bool      `json:"event_invitation_email"`
	EventParticipantJoinedEmail     bool      `json:"event_participant_joined_email"`
	EventWentLiveEmail              bool      `json:"event_went_live_email"`
	EventResultsPostedEmail         bool      `json:"event_results_posted_email"`
	AnnouncementEmail               bool      `json:"announcement_email"`
	UpdatedAt                       time.Time `json:"updated_at"`
}

// DefaultNotificationPreferences returns the defaults used when no row exists.
func DefaultNotificationPreferences(userID string) *NotificationPreferences {
	return &NotificationPreferences{
		UserID:                          userID,
		FollowRequest:                   true,
		FollowAccepted:                  true,
		CommentOnMyCard:                 true,
		ReplyToMyComment:                true,
		LikeOnMyContent:                 true,
		ScoreVerified:                   true,
		ScoreRejected:                   true,
		ScoreAmended:                    true,
		LeagueJoinApproved:              true,
		ClubJoinApproved:                true,
		Mention:                         true,
		PostFlagged:                     true,
		ReportFiled:                     true,
		TicketCreated:                   true,
		TicketReplied:                   true,
		TicketAssigned:                  true,
		TicketStatusChanged:             true,
		FeatureRequestStateChanged:      true,
		ScoreValidationRequested:        true,
		LeagueJoinRequest:               true,
		LeagueJoinRejected:              true,
		LeagueRoleChanged:               true,
		LeagueRoundOpened:               true,
		ClubJoinRequest:                 true,
		ClubJoinRejected:                true,
		ClubRoleChanged:                 true,
		EventInvitation:                 true,
		EventParticipantJoined:          true,
		EventWentLive:                   true,
		EventResultsPosted:              true,
		Announcement:                    true,
		ReviewRequestsPublic:            false,
		ReviewRequestsLeagues:           false,
		ReviewRequestsClubLeagues:       false,
		DigestEmail:                     false,
		FollowRequestEmail:              true,
		FollowAcceptedEmail:             true,
		CommentOnMyCardEmail:            true,
		ReplyToMyCommentEmail:           true,
		LikeOnMyContentEmail:            true,
		ScoreVerifiedEmail:              true,
		ScoreRejectedEmail:              true,
		ScoreAmendedEmail:               true,
		LeagueJoinApprovedEmail:         true,
		ClubJoinApprovedEmail:           true,
		MentionEmail:                    true,
		PostFlaggedEmail:                true,
		TicketCreatedEmail:              true,
		TicketRepliedEmail:              true,
		TicketAssignedEmail:             true,
		TicketStatusChangedEmail:        true,
		FeatureRequestStateChangedEmail: true,
		// A type addressed to one person defaults to email on; one broadcast to
		// every member, participant or follower defaults to email off, so
		// joining a busy league or event doesn't fill an inbox. These defaults
		// mirror the column defaults in migration 000117.
		ScoreValidationRequestedEmail: false,
		LeagueJoinRequestEmail:        true,
		LeagueJoinRejectedEmail:       true,
		LeagueRoleChangedEmail:        true,
		LeagueRoundOpenedEmail:        false,
		ClubJoinRequestEmail:          true,
		ClubJoinRejectedEmail:         true,
		ClubRoleChangedEmail:          true,
		EventInvitationEmail:          true,
		EventParticipantJoinedEmail:   false,
		EventWentLiveEmail:            false,
		EventResultsPostedEmail:       false,
		// An announcement is the exception to the reach rule above: it is
		// human-authored, and the sender opts into email per announcement, so
		// this flag is the recipient's veto rather than the trigger.
		AnnouncementEmail: true,
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
	case NotificationTypePostFlagged:
		return p.PostFlagged
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
	case NotificationTypeScoreValidationRequested:
		return p.ScoreValidationRequested
	case NotificationTypeLeagueJoinRequest:
		return p.LeagueJoinRequest
	case NotificationTypeLeagueJoinRejected:
		return p.LeagueJoinRejected
	case NotificationTypeLeagueRoleChanged:
		return p.LeagueRoleChanged
	case NotificationTypeLeagueRoundOpened:
		return p.LeagueRoundOpened
	case NotificationTypeClubJoinRequest:
		return p.ClubJoinRequest
	case NotificationTypeClubJoinRejected:
		return p.ClubJoinRejected
	case NotificationTypeClubRoleChanged:
		return p.ClubRoleChanged
	case NotificationTypeEventInvitation:
		return p.EventInvitation
	case NotificationTypeEventParticipantJoined:
		return p.EventParticipantJoined
	case NotificationTypeEventWentLive:
		return p.EventWentLive
	case NotificationTypeEventResultsPosted:
		return p.EventResultsPosted
	case NotificationTypeAnnouncement:
		return p.Announcement
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
	case NotificationTypePostFlagged:
		return p.PostFlaggedEmail
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
	case NotificationTypeScoreValidationRequested:
		return p.ScoreValidationRequestedEmail
	case NotificationTypeLeagueJoinRequest:
		return p.LeagueJoinRequestEmail
	case NotificationTypeLeagueJoinRejected:
		return p.LeagueJoinRejectedEmail
	case NotificationTypeLeagueRoleChanged:
		return p.LeagueRoleChangedEmail
	case NotificationTypeLeagueRoundOpened:
		return p.LeagueRoundOpenedEmail
	case NotificationTypeClubJoinRequest:
		return p.ClubJoinRequestEmail
	case NotificationTypeClubJoinRejected:
		return p.ClubJoinRejectedEmail
	case NotificationTypeClubRoleChanged:
		return p.ClubRoleChangedEmail
	case NotificationTypeEventInvitation:
		return p.EventInvitationEmail
	case NotificationTypeEventParticipantJoined:
		return p.EventParticipantJoinedEmail
	case NotificationTypeEventWentLive:
		return p.EventWentLiveEmail
	case NotificationTypeEventResultsPosted:
		return p.EventResultsPostedEmail
	case NotificationTypeAnnouncement:
		return p.AnnouncementEmail
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
	PostFlagged                     *bool `json:"post_flagged,omitempty"`
	ReportFiled                     *bool `json:"report_filed,omitempty"`
	TicketCreated                   *bool `json:"ticket_created,omitempty"`
	TicketReplied                   *bool `json:"ticket_replied,omitempty"`
	TicketAssigned                  *bool `json:"ticket_assigned,omitempty"`
	TicketStatusChanged             *bool `json:"ticket_status_changed,omitempty"`
	FeatureRequestStateChanged      *bool `json:"feature_request_state_changed,omitempty"`
	ScoreValidationRequested        *bool `json:"score_validation_requested,omitempty"`
	LeagueJoinRequest               *bool `json:"league_join_request,omitempty"`
	LeagueJoinRejected              *bool `json:"league_join_rejected,omitempty"`
	LeagueRoleChanged               *bool `json:"league_role_changed,omitempty"`
	LeagueRoundOpened               *bool `json:"league_round_opened,omitempty"`
	ClubJoinRequest                 *bool `json:"club_join_request,omitempty"`
	ClubJoinRejected                *bool `json:"club_join_rejected,omitempty"`
	ClubRoleChanged                 *bool `json:"club_role_changed,omitempty"`
	EventInvitation                 *bool `json:"event_invitation,omitempty"`
	EventParticipantJoined          *bool `json:"event_participant_joined,omitempty"`
	EventWentLive                   *bool `json:"event_went_live,omitempty"`
	EventResultsPosted              *bool `json:"event_results_posted,omitempty"`
	Announcement                    *bool `json:"announcement,omitempty"`
	ReviewRequestsPublic            *bool `json:"review_requests_public,omitempty"`
	ReviewRequestsLeagues           *bool `json:"review_requests_leagues,omitempty"`
	ReviewRequestsClubLeagues       *bool `json:"review_requests_club_leagues,omitempty"`
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
	PostFlaggedEmail                *bool `json:"post_flagged_email,omitempty"`
	TicketCreatedEmail              *bool `json:"ticket_created_email,omitempty"`
	TicketRepliedEmail              *bool `json:"ticket_replied_email,omitempty"`
	TicketAssignedEmail             *bool `json:"ticket_assigned_email,omitempty"`
	TicketStatusChangedEmail        *bool `json:"ticket_status_changed_email,omitempty"`
	FeatureRequestStateChangedEmail *bool `json:"feature_request_state_changed_email,omitempty"`
	ScoreValidationRequestedEmail   *bool `json:"score_validation_requested_email,omitempty"`
	LeagueJoinRequestEmail          *bool `json:"league_join_request_email,omitempty"`
	LeagueJoinRejectedEmail         *bool `json:"league_join_rejected_email,omitempty"`
	LeagueRoleChangedEmail          *bool `json:"league_role_changed_email,omitempty"`
	LeagueRoundOpenedEmail          *bool `json:"league_round_opened_email,omitempty"`
	ClubJoinRequestEmail            *bool `json:"club_join_request_email,omitempty"`
	ClubJoinRejectedEmail           *bool `json:"club_join_rejected_email,omitempty"`
	ClubRoleChangedEmail            *bool `json:"club_role_changed_email,omitempty"`
	EventInvitationEmail            *bool `json:"event_invitation_email,omitempty"`
	EventParticipantJoinedEmail     *bool `json:"event_participant_joined_email,omitempty"`
	EventWentLiveEmail              *bool `json:"event_went_live_email,omitempty"`
	EventResultsPostedEmail         *bool `json:"event_results_posted_email,omitempty"`
	AnnouncementEmail               *bool `json:"announcement_email,omitempty"`
}
