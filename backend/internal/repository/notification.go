package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type NotificationRepository struct {
	db *pgxpool.Pool
}

func NewNotificationRepository(db *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// Insert creates a notification row.
func (r *NotificationRepository) Insert(ctx context.Context, n *model.Notification) error {
	var metaBytes []byte
	if n.Metadata != nil {
		b, err := json.Marshal(n.Metadata)
		if err != nil {
			return fmt.Errorf("marshal metadata: %w", err)
		}
		metaBytes = b
	}
	err := r.db.QueryRow(ctx, `
		INSERT INTO notifications
			(recipient_id, actor_id, type, target_id, target_type, league_id, club_id, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`, n.RecipientID, n.ActorID, n.Type, n.TargetID, n.TargetType, n.LeagueID, n.ClubID, metaBytes).
		Scan(&n.ID, &n.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert notification: %w", err)
	}
	return nil
}

// AnnouncementEmailRecipient is one person to email about an announcement.
type AnnouncementEmailRecipient struct {
	UserID      string
	Email       string
	DisplayName string
}

// InsertAnnouncementFanout writes one notification row per recipient in a
// single statement, skipping anyone who has turned announcements off, and
// returns the ids actually written.
//
// Fanout's per-recipient path would be three queries each; an announcement can
// address the whole platform, so the preference check moves into the insert.
// Blocks and mutes are deliberately not consulted: an announcement comes from
// the group you joined, not from a person you chose to hear from.
func (r *NotificationRepository) InsertAnnouncementFanout(ctx context.Context, n *model.Notification, recipientIDs []string) ([]string, error) {
	if len(recipientIDs) == 0 {
		return nil, nil
	}
	var metaBytes []byte
	if n.Metadata != nil {
		b, err := json.Marshal(n.Metadata)
		if err != nil {
			return nil, fmt.Errorf("marshal metadata: %w", err)
		}
		metaBytes = b
	}
	rows, err := r.db.Query(ctx, `
		INSERT INTO notifications
			(recipient_id, actor_id, type, target_id, target_type, league_id, club_id, metadata)
		SELECT r.id, $2, $3, $4, $5, $6, $7, $8
		FROM unnest($1::uuid[]) AS r(id)
		LEFT JOIN notification_preferences p ON p.user_id = r.id
		WHERE COALESCE(p.announcement, TRUE)
		RETURNING recipient_id
	`, recipientIDs, n.ActorID, n.Type, n.TargetID, n.TargetType, n.LeagueID, n.ClubID, metaBytes)
	if err != nil {
		return nil, fmt.Errorf("insert announcement fanout: %w", err)
	}
	defer rows.Close()
	var delivered []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan announcement recipient: %w", err)
		}
		delivered = append(delivered, id)
	}
	return delivered, rows.Err()
}

// ListAnnouncementEmailRecipients narrows a recipient list to the live
// accounts that accept announcement email.
func (r *NotificationRepository) ListAnnouncementEmailRecipients(ctx context.Context, recipientIDs []string) ([]AnnouncementEmailRecipient, error) {
	if len(recipientIDs) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.email, u.display_name
		FROM unnest($1::uuid[]) AS r(id)
		JOIN users u ON u.id = r.id AND u.deleted_at IS NULL
		LEFT JOIN notification_preferences p ON p.user_id = r.id
		WHERE COALESCE(p.announcement_email, TRUE)
	`, recipientIDs)
	if err != nil {
		return nil, fmt.Errorf("list announcement email recipients: %w", err)
	}
	defer rows.Close()
	var out []AnnouncementEmailRecipient
	for rows.Next() {
		var rec AnnouncementEmailRecipient
		if err := rows.Scan(&rec.UserID, &rec.Email, &rec.DisplayName); err != nil {
			return nil, fmt.Errorf("scan announcement email recipient: %w", err)
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// Review volunteers — people who asked to be sent other shooters' cards to
// validate. The opt-in lives on notification_preferences, so these queries do
// too even though two of them join a membership table: they answer "who wants
// to be asked", which is a preference question scoped by where they belong.
//
// Each is capped and randomised. A validation request is a favour, and asking
// the same first N volunteers every time would burn them out while the rest of
// the pool never hears anything; ORDER BY random() sorts only the opted-in
// rows, which are by definition a self-selected minority.

// ListPublicReviewVolunteers returns people who accept validation requests for
// anyone's public card.
func (r *NotificationRepository) ListPublicReviewVolunteers(ctx context.Context, limit int) ([]string, error) {
	return r.reviewVolunteers(ctx, `
		SELECT p.user_id
		FROM notification_preferences p
		JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND NOT u.is_simulated
		WHERE p.review_requests_public
		ORDER BY random()
		LIMIT $1
	`, limit)
}

// ListLeagueReviewVolunteers returns members of the league who accept
// validation requests for the leagues they are in.
func (r *NotificationRepository) ListLeagueReviewVolunteers(ctx context.Context, leagueID string, limit int) ([]string, error) {
	return r.reviewVolunteers(ctx, `
		SELECT p.user_id
		FROM notification_preferences p
		JOIN league_members m ON m.user_id = p.user_id AND m.league_id = $2
		JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND NOT u.is_simulated
		WHERE p.review_requests_leagues
		ORDER BY random()
		LIMIT $1
	`, limit, leagueID)
}

// ListClubLeagueReviewVolunteers returns members of the club hosting a league
// who accept validation requests for their clubs' leagues. They need not be in
// the league itself — the point is that a club vouches for its own shooters.
func (r *NotificationRepository) ListClubLeagueReviewVolunteers(ctx context.Context, clubID string, limit int) ([]string, error) {
	return r.reviewVolunteers(ctx, `
		SELECT p.user_id
		FROM notification_preferences p
		JOIN club_members m ON m.user_id = p.user_id AND m.club_id = $2
		JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND NOT u.is_simulated
		WHERE p.review_requests_club_leagues
		ORDER BY random()
		LIMIT $1
	`, limit, clubID)
}

func (r *NotificationRepository) reviewVolunteers(ctx context.Context, query string, limit int, args ...any) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx, query, append([]any{limit}, args...)...)
	if err != nil {
		return nil, fmt.Errorf("list review volunteers: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan review volunteer: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// HasNotificationForTarget reports whether the user was sent a notification
// pointing at a target. Announcements use it as the read gate: having been
// sent one is exactly the right to read it, with no membership re-derivation.
func (r *NotificationRepository) HasNotificationForTarget(ctx context.Context, recipientID, targetID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM notifications
			WHERE recipient_id = $1 AND target_id = $2
		)
	`, recipientID, targetID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check notification for target: %w", err)
	}
	return exists, nil
}

// ListForUser returns notifications for a recipient ordered newest first.
// cursor is the created_at timestamp (RFC3339) of the last row from the
// previous page; empty means from the beginning.
func (r *NotificationRepository) ListForUser(ctx context.Context, recipientID string, limit int, cursor string) ([]*model.Notification, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	query := `
		SELECT n.id, n.recipient_id, n.actor_id, u.display_name, u.avatar_url,
		       n.type, n.target_id, n.target_type, n.league_id, n.club_id,
		       n.metadata, n.read_at, n.created_at
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_id
		WHERE n.recipient_id = $1
	`
	args := []any{recipientID}
	if cursor != "" {
		query += " AND n.created_at < $2"
		args = append(args, cursor)
	}
	query += " ORDER BY n.created_at DESC LIMIT $" + fmt.Sprintf("%d", len(args)+1)
	args = append(args, limit+1)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	var items []*model.Notification
	for rows.Next() {
		n := &model.Notification{}
		var metaBytes []byte
		if err := rows.Scan(
			&n.ID, &n.RecipientID, &n.ActorID, &n.ActorDisplayName, &n.ActorAvatarURL,
			&n.Type, &n.TargetID, &n.TargetType, &n.LeagueID, &n.ClubID,
			&metaBytes, &n.ReadAt, &n.CreatedAt,
		); err != nil {
			return nil, "", fmt.Errorf("scan notification: %w", err)
		}
		if len(metaBytes) > 0 {
			_ = json.Unmarshal(metaBytes, &n.Metadata)
		}
		items = append(items, n)
	}

	next := ""
	if len(items) > limit {
		next = items[limit-1].CreatedAt.Format("2006-01-02T15:04:05.999999Z07:00")
		items = items[:limit]
	}
	if items == nil {
		items = []*model.Notification{}
	}
	return items, next, nil
}

// UnreadCount returns the number of unread notifications for a user.
func (r *NotificationRepository) UnreadCount(ctx context.Context, recipientID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE recipient_id = $1 AND read_at IS NULL
	`, recipientID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("unread count: %w", err)
	}
	return n, nil
}

// MarkRead flips read_at=NOW() for the given notification ids belonging to
// recipientID. Passing an empty ids slice marks all unread rows as read.
func (r *NotificationRepository) MarkRead(ctx context.Context, recipientID string, ids []string) error {
	if len(ids) == 0 {
		_, err := r.db.Exec(ctx, `
			UPDATE notifications SET read_at = NOW()
			WHERE recipient_id = $1 AND read_at IS NULL
		`, recipientID)
		if err != nil {
			return fmt.Errorf("mark all read: %w", err)
		}
		return nil
	}
	_, err := r.db.Exec(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE recipient_id = $1 AND id = ANY($2) AND read_at IS NULL
	`, recipientID, ids)
	if err != nil {
		return fmt.Errorf("mark read: %w", err)
	}
	return nil
}

// GetPreferences returns the user's preferences, falling back to defaults.
func (r *NotificationRepository) GetPreferences(ctx context.Context, userID string) (*model.NotificationPreferences, error) {
	p := model.DefaultNotificationPreferences(userID)
	err := r.db.QueryRow(ctx, `
		SELECT user_id, follow_request, follow_accepted, comment_on_my_card,
		       reply_to_my_comment, like_on_my_content, score_verified, score_rejected,
		       score_amended, league_join_approved, club_join_approved, mention,
		       post_flagged, report_filed, ticket_created, ticket_replied, ticket_assigned,
		       ticket_status_changed, feature_request_state_changed, digest_email,
		       follow_request_email, follow_accepted_email, comment_on_my_card_email,
		       reply_to_my_comment_email, like_on_my_content_email, score_verified_email,
		       score_rejected_email, score_amended_email, league_join_approved_email,
		       club_join_approved_email, mention_email, post_flagged_email, ticket_created_email,
		       ticket_replied_email, ticket_assigned_email, ticket_status_changed_email,
		       feature_request_state_changed_email,
		       score_validation_requested, league_join_request, league_join_rejected,
		       league_role_changed, league_round_opened, club_join_request,
		       club_join_rejected, club_role_changed, event_invitation,
		       event_participant_joined, event_went_live, event_results_posted,
		       score_validation_requested_email, league_join_request_email,
		       league_join_rejected_email, league_role_changed_email,
		       league_round_opened_email, club_join_request_email,
		       club_join_rejected_email, club_role_changed_email, event_invitation_email,
		       event_participant_joined_email, event_went_live_email,
		       event_results_posted_email, announcement, announcement_email,
		       review_requests_public, review_requests_leagues, review_requests_club_leagues,
		       updated_at
		FROM notification_preferences
		WHERE user_id = $1
	`, userID).Scan(
		&p.UserID, &p.FollowRequest, &p.FollowAccepted, &p.CommentOnMyCard,
		&p.ReplyToMyComment, &p.LikeOnMyContent, &p.ScoreVerified, &p.ScoreRejected,
		&p.ScoreAmended, &p.LeagueJoinApproved, &p.ClubJoinApproved, &p.Mention,
		&p.PostFlagged, &p.ReportFiled, &p.TicketCreated, &p.TicketReplied, &p.TicketAssigned,
		&p.TicketStatusChanged, &p.FeatureRequestStateChanged, &p.DigestEmail,
		&p.FollowRequestEmail, &p.FollowAcceptedEmail, &p.CommentOnMyCardEmail,
		&p.ReplyToMyCommentEmail, &p.LikeOnMyContentEmail, &p.ScoreVerifiedEmail,
		&p.ScoreRejectedEmail, &p.ScoreAmendedEmail, &p.LeagueJoinApprovedEmail,
		&p.ClubJoinApprovedEmail, &p.MentionEmail, &p.PostFlaggedEmail, &p.TicketCreatedEmail,
		&p.TicketRepliedEmail, &p.TicketAssignedEmail, &p.TicketStatusChangedEmail,
		&p.FeatureRequestStateChangedEmail,
		&p.ScoreValidationRequested, &p.LeagueJoinRequest, &p.LeagueJoinRejected,
		&p.LeagueRoleChanged, &p.LeagueRoundOpened, &p.ClubJoinRequest,
		&p.ClubJoinRejected, &p.ClubRoleChanged, &p.EventInvitation,
		&p.EventParticipantJoined, &p.EventWentLive, &p.EventResultsPosted,
		&p.ScoreValidationRequestedEmail, &p.LeagueJoinRequestEmail,
		&p.LeagueJoinRejectedEmail, &p.LeagueRoleChangedEmail,
		&p.LeagueRoundOpenedEmail, &p.ClubJoinRequestEmail,
		&p.ClubJoinRejectedEmail, &p.ClubRoleChangedEmail, &p.EventInvitationEmail,
		&p.EventParticipantJoinedEmail, &p.EventWentLiveEmail,
		&p.EventResultsPostedEmail, &p.Announcement, &p.AnnouncementEmail,
		&p.ReviewRequestsPublic, &p.ReviewRequestsLeagues, &p.ReviewRequestsClubLeagues,
		&p.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return p, nil
		}
		return nil, fmt.Errorf("get prefs: %w", err)
	}
	return p, nil
}

// UpsertPreferences writes a patch over existing preferences.
func (r *NotificationRepository) UpsertPreferences(ctx context.Context, userID string, in *model.UpdateNotificationPrefsInput) (*model.NotificationPreferences, error) {
	current, err := r.GetPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}
	if in.FollowRequest != nil {
		current.FollowRequest = *in.FollowRequest
	}
	if in.FollowAccepted != nil {
		current.FollowAccepted = *in.FollowAccepted
	}
	if in.CommentOnMyCard != nil {
		current.CommentOnMyCard = *in.CommentOnMyCard
	}
	if in.ReplyToMyComment != nil {
		current.ReplyToMyComment = *in.ReplyToMyComment
	}
	if in.LikeOnMyContent != nil {
		current.LikeOnMyContent = *in.LikeOnMyContent
	}
	if in.ScoreVerified != nil {
		current.ScoreVerified = *in.ScoreVerified
	}
	if in.ScoreRejected != nil {
		current.ScoreRejected = *in.ScoreRejected
	}
	if in.ScoreAmended != nil {
		current.ScoreAmended = *in.ScoreAmended
	}
	if in.LeagueJoinApproved != nil {
		current.LeagueJoinApproved = *in.LeagueJoinApproved
	}
	if in.ClubJoinApproved != nil {
		current.ClubJoinApproved = *in.ClubJoinApproved
	}
	if in.Mention != nil {
		current.Mention = *in.Mention
	}
	if in.PostFlagged != nil {
		current.PostFlagged = *in.PostFlagged
	}
	if in.ReportFiled != nil {
		current.ReportFiled = *in.ReportFiled
	}
	if in.TicketCreated != nil {
		current.TicketCreated = *in.TicketCreated
	}
	if in.TicketReplied != nil {
		current.TicketReplied = *in.TicketReplied
	}
	if in.TicketAssigned != nil {
		current.TicketAssigned = *in.TicketAssigned
	}
	if in.TicketStatusChanged != nil {
		current.TicketStatusChanged = *in.TicketStatusChanged
	}
	if in.FeatureRequestStateChanged != nil {
		current.FeatureRequestStateChanged = *in.FeatureRequestStateChanged
	}
	if in.DigestEmail != nil {
		current.DigestEmail = *in.DigestEmail
	}
	if in.FollowRequestEmail != nil {
		current.FollowRequestEmail = *in.FollowRequestEmail
	}
	if in.FollowAcceptedEmail != nil {
		current.FollowAcceptedEmail = *in.FollowAcceptedEmail
	}
	if in.CommentOnMyCardEmail != nil {
		current.CommentOnMyCardEmail = *in.CommentOnMyCardEmail
	}
	if in.ReplyToMyCommentEmail != nil {
		current.ReplyToMyCommentEmail = *in.ReplyToMyCommentEmail
	}
	if in.LikeOnMyContentEmail != nil {
		current.LikeOnMyContentEmail = *in.LikeOnMyContentEmail
	}
	if in.ScoreVerifiedEmail != nil {
		current.ScoreVerifiedEmail = *in.ScoreVerifiedEmail
	}
	if in.ScoreRejectedEmail != nil {
		current.ScoreRejectedEmail = *in.ScoreRejectedEmail
	}
	if in.ScoreAmendedEmail != nil {
		current.ScoreAmendedEmail = *in.ScoreAmendedEmail
	}
	if in.LeagueJoinApprovedEmail != nil {
		current.LeagueJoinApprovedEmail = *in.LeagueJoinApprovedEmail
	}
	if in.ClubJoinApprovedEmail != nil {
		current.ClubJoinApprovedEmail = *in.ClubJoinApprovedEmail
	}
	if in.MentionEmail != nil {
		current.MentionEmail = *in.MentionEmail
	}
	if in.PostFlaggedEmail != nil {
		current.PostFlaggedEmail = *in.PostFlaggedEmail
	}
	if in.TicketCreatedEmail != nil {
		current.TicketCreatedEmail = *in.TicketCreatedEmail
	}
	if in.TicketRepliedEmail != nil {
		current.TicketRepliedEmail = *in.TicketRepliedEmail
	}
	if in.TicketAssignedEmail != nil {
		current.TicketAssignedEmail = *in.TicketAssignedEmail
	}
	if in.TicketStatusChangedEmail != nil {
		current.TicketStatusChangedEmail = *in.TicketStatusChangedEmail
	}
	if in.FeatureRequestStateChangedEmail != nil {
		current.FeatureRequestStateChangedEmail = *in.FeatureRequestStateChangedEmail
	}
	if in.ScoreValidationRequested != nil {
		current.ScoreValidationRequested = *in.ScoreValidationRequested
	}
	if in.LeagueJoinRequest != nil {
		current.LeagueJoinRequest = *in.LeagueJoinRequest
	}
	if in.LeagueJoinRejected != nil {
		current.LeagueJoinRejected = *in.LeagueJoinRejected
	}
	if in.LeagueRoleChanged != nil {
		current.LeagueRoleChanged = *in.LeagueRoleChanged
	}
	if in.LeagueRoundOpened != nil {
		current.LeagueRoundOpened = *in.LeagueRoundOpened
	}
	if in.ClubJoinRequest != nil {
		current.ClubJoinRequest = *in.ClubJoinRequest
	}
	if in.ClubJoinRejected != nil {
		current.ClubJoinRejected = *in.ClubJoinRejected
	}
	if in.ClubRoleChanged != nil {
		current.ClubRoleChanged = *in.ClubRoleChanged
	}
	if in.EventInvitation != nil {
		current.EventInvitation = *in.EventInvitation
	}
	if in.EventParticipantJoined != nil {
		current.EventParticipantJoined = *in.EventParticipantJoined
	}
	if in.EventWentLive != nil {
		current.EventWentLive = *in.EventWentLive
	}
	if in.EventResultsPosted != nil {
		current.EventResultsPosted = *in.EventResultsPosted
	}
	if in.ScoreValidationRequestedEmail != nil {
		current.ScoreValidationRequestedEmail = *in.ScoreValidationRequestedEmail
	}
	if in.LeagueJoinRequestEmail != nil {
		current.LeagueJoinRequestEmail = *in.LeagueJoinRequestEmail
	}
	if in.LeagueJoinRejectedEmail != nil {
		current.LeagueJoinRejectedEmail = *in.LeagueJoinRejectedEmail
	}
	if in.LeagueRoleChangedEmail != nil {
		current.LeagueRoleChangedEmail = *in.LeagueRoleChangedEmail
	}
	if in.LeagueRoundOpenedEmail != nil {
		current.LeagueRoundOpenedEmail = *in.LeagueRoundOpenedEmail
	}
	if in.ClubJoinRequestEmail != nil {
		current.ClubJoinRequestEmail = *in.ClubJoinRequestEmail
	}
	if in.ClubJoinRejectedEmail != nil {
		current.ClubJoinRejectedEmail = *in.ClubJoinRejectedEmail
	}
	if in.ClubRoleChangedEmail != nil {
		current.ClubRoleChangedEmail = *in.ClubRoleChangedEmail
	}
	if in.EventInvitationEmail != nil {
		current.EventInvitationEmail = *in.EventInvitationEmail
	}
	if in.EventParticipantJoinedEmail != nil {
		current.EventParticipantJoinedEmail = *in.EventParticipantJoinedEmail
	}
	if in.EventWentLiveEmail != nil {
		current.EventWentLiveEmail = *in.EventWentLiveEmail
	}
	if in.EventResultsPostedEmail != nil {
		current.EventResultsPostedEmail = *in.EventResultsPostedEmail
	}
	if in.Announcement != nil {
		current.Announcement = *in.Announcement
	}
	if in.AnnouncementEmail != nil {
		current.AnnouncementEmail = *in.AnnouncementEmail
	}
	if in.ReviewRequestsPublic != nil {
		current.ReviewRequestsPublic = *in.ReviewRequestsPublic
	}
	if in.ReviewRequestsLeagues != nil {
		current.ReviewRequestsLeagues = *in.ReviewRequestsLeagues
	}
	if in.ReviewRequestsClubLeagues != nil {
		current.ReviewRequestsClubLeagues = *in.ReviewRequestsClubLeagues
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO notification_preferences (
			user_id, follow_request, follow_accepted, comment_on_my_card,
			reply_to_my_comment, like_on_my_content, score_verified, score_rejected,
			score_amended, league_join_approved, club_join_approved, mention,
			post_flagged, report_filed, ticket_created, ticket_replied, ticket_assigned,
			ticket_status_changed, feature_request_state_changed, digest_email,
			follow_request_email, follow_accepted_email, comment_on_my_card_email,
			reply_to_my_comment_email, like_on_my_content_email, score_verified_email,
			score_rejected_email, score_amended_email, league_join_approved_email,
			club_join_approved_email, mention_email, post_flagged_email, ticket_created_email,
			ticket_replied_email, ticket_assigned_email, ticket_status_changed_email,
			feature_request_state_changed_email,
			score_validation_requested, league_join_request, league_join_rejected,
			league_role_changed, league_round_opened, club_join_request,
			club_join_rejected, club_role_changed, event_invitation,
			event_participant_joined, event_went_live, event_results_posted,
			score_validation_requested_email, league_join_request_email,
			league_join_rejected_email, league_role_changed_email,
			league_round_opened_email, club_join_request_email,
			club_join_rejected_email, club_role_changed_email, event_invitation_email,
			event_participant_joined_email, event_went_live_email,
			event_results_posted_email, announcement, announcement_email,
			review_requests_public, review_requests_leagues, review_requests_club_leagues,
			updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
			$27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
			$38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49,
			$50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61,
			$62, $63, $64, $65, $66,
			NOW()
		)
		ON CONFLICT (user_id) DO UPDATE SET
			follow_request             = EXCLUDED.follow_request,
			follow_accepted            = EXCLUDED.follow_accepted,
			comment_on_my_card         = EXCLUDED.comment_on_my_card,
			reply_to_my_comment        = EXCLUDED.reply_to_my_comment,
			like_on_my_content         = EXCLUDED.like_on_my_content,
			score_verified             = EXCLUDED.score_verified,
			score_rejected             = EXCLUDED.score_rejected,
			score_amended              = EXCLUDED.score_amended,
			league_join_approved       = EXCLUDED.league_join_approved,
			club_join_approved         = EXCLUDED.club_join_approved,
			mention                    = EXCLUDED.mention,
			post_flagged               = EXCLUDED.post_flagged,
			report_filed               = EXCLUDED.report_filed,
			ticket_created             = EXCLUDED.ticket_created,
			ticket_replied             = EXCLUDED.ticket_replied,
			ticket_assigned            = EXCLUDED.ticket_assigned,
			ticket_status_changed      = EXCLUDED.ticket_status_changed,
			feature_request_state_changed = EXCLUDED.feature_request_state_changed,
			digest_email               = EXCLUDED.digest_email,
			follow_request_email       = EXCLUDED.follow_request_email,
			follow_accepted_email      = EXCLUDED.follow_accepted_email,
			comment_on_my_card_email   = EXCLUDED.comment_on_my_card_email,
			reply_to_my_comment_email  = EXCLUDED.reply_to_my_comment_email,
			like_on_my_content_email   = EXCLUDED.like_on_my_content_email,
			score_verified_email       = EXCLUDED.score_verified_email,
			score_rejected_email       = EXCLUDED.score_rejected_email,
			score_amended_email        = EXCLUDED.score_amended_email,
			league_join_approved_email = EXCLUDED.league_join_approved_email,
			club_join_approved_email   = EXCLUDED.club_join_approved_email,
			mention_email              = EXCLUDED.mention_email,
			post_flagged_email         = EXCLUDED.post_flagged_email,
			ticket_created_email       = EXCLUDED.ticket_created_email,
			ticket_replied_email       = EXCLUDED.ticket_replied_email,
			ticket_assigned_email      = EXCLUDED.ticket_assigned_email,
			ticket_status_changed_email = EXCLUDED.ticket_status_changed_email,
			feature_request_state_changed_email = EXCLUDED.feature_request_state_changed_email,
			score_validation_requested = EXCLUDED.score_validation_requested,
			league_join_request        = EXCLUDED.league_join_request,
			league_join_rejected       = EXCLUDED.league_join_rejected,
			league_role_changed        = EXCLUDED.league_role_changed,
			league_round_opened        = EXCLUDED.league_round_opened,
			club_join_request          = EXCLUDED.club_join_request,
			club_join_rejected         = EXCLUDED.club_join_rejected,
			club_role_changed          = EXCLUDED.club_role_changed,
			event_invitation           = EXCLUDED.event_invitation,
			event_participant_joined   = EXCLUDED.event_participant_joined,
			event_went_live            = EXCLUDED.event_went_live,
			event_results_posted       = EXCLUDED.event_results_posted,
			score_validation_requested_email = EXCLUDED.score_validation_requested_email,
			league_join_request_email  = EXCLUDED.league_join_request_email,
			league_join_rejected_email = EXCLUDED.league_join_rejected_email,
			league_role_changed_email  = EXCLUDED.league_role_changed_email,
			league_round_opened_email  = EXCLUDED.league_round_opened_email,
			club_join_request_email    = EXCLUDED.club_join_request_email,
			club_join_rejected_email   = EXCLUDED.club_join_rejected_email,
			club_role_changed_email    = EXCLUDED.club_role_changed_email,
			event_invitation_email     = EXCLUDED.event_invitation_email,
			event_participant_joined_email = EXCLUDED.event_participant_joined_email,
			event_went_live_email      = EXCLUDED.event_went_live_email,
			event_results_posted_email = EXCLUDED.event_results_posted_email,
			announcement               = EXCLUDED.announcement,
			announcement_email         = EXCLUDED.announcement_email,
			review_requests_public     = EXCLUDED.review_requests_public,
			review_requests_leagues    = EXCLUDED.review_requests_leagues,
			review_requests_club_leagues = EXCLUDED.review_requests_club_leagues,
			updated_at                 = NOW()
	`,
		current.UserID, current.FollowRequest, current.FollowAccepted, current.CommentOnMyCard,
		current.ReplyToMyComment, current.LikeOnMyContent, current.ScoreVerified, current.ScoreRejected,
		current.ScoreAmended, current.LeagueJoinApproved, current.ClubJoinApproved, current.Mention,
		current.PostFlagged, current.ReportFiled, current.TicketCreated, current.TicketReplied, current.TicketAssigned,
		current.TicketStatusChanged, current.FeatureRequestStateChanged, current.DigestEmail,
		current.FollowRequestEmail, current.FollowAcceptedEmail, current.CommentOnMyCardEmail,
		current.ReplyToMyCommentEmail, current.LikeOnMyContentEmail, current.ScoreVerifiedEmail,
		current.ScoreRejectedEmail, current.ScoreAmendedEmail, current.LeagueJoinApprovedEmail,
		current.ClubJoinApprovedEmail, current.MentionEmail, current.PostFlaggedEmail, current.TicketCreatedEmail,
		current.TicketRepliedEmail, current.TicketAssignedEmail, current.TicketStatusChangedEmail,
		current.FeatureRequestStateChangedEmail,
		current.ScoreValidationRequested, current.LeagueJoinRequest, current.LeagueJoinRejected,
		current.LeagueRoleChanged, current.LeagueRoundOpened, current.ClubJoinRequest,
		current.ClubJoinRejected, current.ClubRoleChanged, current.EventInvitation,
		current.EventParticipantJoined, current.EventWentLive, current.EventResultsPosted,
		current.ScoreValidationRequestedEmail, current.LeagueJoinRequestEmail,
		current.LeagueJoinRejectedEmail, current.LeagueRoleChangedEmail,
		current.LeagueRoundOpenedEmail, current.ClubJoinRequestEmail,
		current.ClubJoinRejectedEmail, current.ClubRoleChangedEmail, current.EventInvitationEmail,
		current.EventParticipantJoinedEmail, current.EventWentLiveEmail,
		current.EventResultsPostedEmail, current.Announcement, current.AnnouncementEmail,
		current.ReviewRequestsPublic, current.ReviewRequestsLeagues, current.ReviewRequestsClubLeagues,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert prefs: %w", err)
	}
	return current, nil
}
