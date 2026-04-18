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
		       report_filed, ticket_created, ticket_replied, ticket_assigned,
		       ticket_status_changed, feature_request_state_changed, digest_email,
		       follow_request_email, follow_accepted_email, comment_on_my_card_email,
		       reply_to_my_comment_email, like_on_my_content_email, score_verified_email,
		       score_rejected_email, score_amended_email, league_join_approved_email,
		       club_join_approved_email, mention_email, ticket_created_email,
		       ticket_replied_email, ticket_assigned_email, ticket_status_changed_email,
		       feature_request_state_changed_email,
		       updated_at
		FROM notification_preferences
		WHERE user_id = $1
	`, userID).Scan(
		&p.UserID, &p.FollowRequest, &p.FollowAccepted, &p.CommentOnMyCard,
		&p.ReplyToMyComment, &p.LikeOnMyContent, &p.ScoreVerified, &p.ScoreRejected,
		&p.ScoreAmended, &p.LeagueJoinApproved, &p.ClubJoinApproved, &p.Mention,
		&p.ReportFiled, &p.TicketCreated, &p.TicketReplied, &p.TicketAssigned,
		&p.TicketStatusChanged, &p.FeatureRequestStateChanged, &p.DigestEmail,
		&p.FollowRequestEmail, &p.FollowAcceptedEmail, &p.CommentOnMyCardEmail,
		&p.ReplyToMyCommentEmail, &p.LikeOnMyContentEmail, &p.ScoreVerifiedEmail,
		&p.ScoreRejectedEmail, &p.ScoreAmendedEmail, &p.LeagueJoinApprovedEmail,
		&p.ClubJoinApprovedEmail, &p.MentionEmail, &p.TicketCreatedEmail,
		&p.TicketRepliedEmail, &p.TicketAssignedEmail, &p.TicketStatusChangedEmail,
		&p.FeatureRequestStateChangedEmail,
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

	_, err = r.db.Exec(ctx, `
		INSERT INTO notification_preferences (
			user_id, follow_request, follow_accepted, comment_on_my_card,
			reply_to_my_comment, like_on_my_content, score_verified, score_rejected,
			score_amended, league_join_approved, club_join_approved, mention,
			report_filed, ticket_created, ticket_replied, ticket_assigned,
			ticket_status_changed, feature_request_state_changed, digest_email,
			follow_request_email, follow_accepted_email, comment_on_my_card_email,
			reply_to_my_comment_email, like_on_my_content_email, score_verified_email,
			score_rejected_email, score_amended_email, league_join_approved_email,
			club_join_approved_email, mention_email, ticket_created_email,
			ticket_replied_email, ticket_assigned_email, ticket_status_changed_email,
			feature_request_state_changed_email,
			updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
			$27, $28, $29, $30, $31, $32, $33, $34, $35,
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
			ticket_created_email       = EXCLUDED.ticket_created_email,
			ticket_replied_email       = EXCLUDED.ticket_replied_email,
			ticket_assigned_email      = EXCLUDED.ticket_assigned_email,
			ticket_status_changed_email = EXCLUDED.ticket_status_changed_email,
			feature_request_state_changed_email = EXCLUDED.feature_request_state_changed_email,
			updated_at                 = NOW()
	`,
		current.UserID, current.FollowRequest, current.FollowAccepted, current.CommentOnMyCard,
		current.ReplyToMyComment, current.LikeOnMyContent, current.ScoreVerified, current.ScoreRejected,
		current.ScoreAmended, current.LeagueJoinApproved, current.ClubJoinApproved, current.Mention,
		current.ReportFiled, current.TicketCreated, current.TicketReplied, current.TicketAssigned,
		current.TicketStatusChanged, current.FeatureRequestStateChanged, current.DigestEmail,
		current.FollowRequestEmail, current.FollowAcceptedEmail, current.CommentOnMyCardEmail,
		current.ReplyToMyCommentEmail, current.LikeOnMyContentEmail, current.ScoreVerifiedEmail,
		current.ScoreRejectedEmail, current.ScoreAmendedEmail, current.LeagueJoinApprovedEmail,
		current.ClubJoinApprovedEmail, current.MentionEmail, current.TicketCreatedEmail,
		current.TicketRepliedEmail, current.TicketAssignedEmail, current.TicketStatusChangedEmail,
		current.FeatureRequestStateChangedEmail,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert prefs: %w", err)
	}
	return current, nil
}
