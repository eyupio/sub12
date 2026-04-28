package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type EventInvitationRepository struct {
	db *pgxpool.Pool
}

func NewEventInvitationRepository(db *pgxpool.Pool) *EventInvitationRepository {
	return &EventInvitationRepository{db: db}
}

const invitationColumns = `
	id, event_id, inviter_user_id, invitee_user_id, token,
	status, expires_at, created_at, decided_at
`

func scanInvitation(row pgx.Row, inv *model.EventInvitation) error {
	return row.Scan(
		&inv.ID, &inv.EventID, &inv.InviterUserID, &inv.InviteeUserID, &inv.Token,
		&inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.DecidedAt,
	)
}

func generateInvitationToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// Upsert creates a new invitation or returns the existing pending one for the
// (event_id, invitee_user_id) pair. Re-invites of accepted/declined/expired
// rows reset them back to pending with a fresh token and expiry.
func (r *EventInvitationRepository) Upsert(ctx context.Context, eventID, inviterID, inviteeID string, ttl time.Duration) (*model.EventInvitation, bool, error) {
	token, err := generateInvitationToken()
	if err != nil {
		return nil, false, fmt.Errorf("generate token: %w", err)
	}
	expiresAt := time.Now().Add(ttl)
	row := r.db.QueryRow(ctx, `
		INSERT INTO event_invitations (event_id, inviter_user_id, invitee_user_id, token, status, expires_at)
		VALUES ($1, $2, $3, $4, 'pending', $5)
		ON CONFLICT (event_id, invitee_user_id) DO UPDATE
			SET status = 'pending',
			    inviter_user_id = EXCLUDED.inviter_user_id,
			    token = CASE
			        WHEN event_invitations.status = 'pending' AND event_invitations.expires_at > NOW()
			        THEN event_invitations.token
			        ELSE EXCLUDED.token
			    END,
			    expires_at = CASE
			        WHEN event_invitations.status = 'pending' AND event_invitations.expires_at > NOW()
			        THEN event_invitations.expires_at
			        ELSE EXCLUDED.expires_at
			    END,
			    decided_at = NULL
		RETURNING `+invitationColumns+`,
		         (xmax = 0) AS inserted
	`, eventID, inviterID, inviteeID, token, expiresAt)
	var inv model.EventInvitation
	var inserted bool
	if err := row.Scan(
		&inv.ID, &inv.EventID, &inv.InviterUserID, &inv.InviteeUserID, &inv.Token,
		&inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.DecidedAt,
		&inserted,
	); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" {
			// CHECK constraint (e.g. self-invite). Surface as conflict.
			return nil, false, ErrConflict
		}
		return nil, false, fmt.Errorf("upsert invitation: %w", err)
	}
	return &inv, inserted, nil
}

// GetByToken returns the invitation for the given token, or ErrNotFound.
func (r *EventInvitationRepository) GetByToken(ctx context.Context, token string) (*model.EventInvitation, error) {
	var inv model.EventInvitation
	err := scanInvitation(r.db.QueryRow(ctx, `
		SELECT `+invitationColumns+`
		FROM event_invitations
		WHERE token = $1
	`, token), &inv)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get invitation by token: %w", err)
	}
	return &inv, nil
}

// MarkExpiredIfPast flips a pending invitation to 'expired' when its
// expires_at has passed. No-op otherwise. Returns the post-update status.
func (r *EventInvitationRepository) MarkExpiredIfPast(ctx context.Context, id string) (string, error) {
	var status string
	err := r.db.QueryRow(ctx, `
		UPDATE event_invitations
		   SET status = 'expired'
		 WHERE id = $1
		   AND status = 'pending'
		   AND expires_at < NOW()
		RETURNING status
	`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		// Either not pending, or not yet expired. Read current status.
		err2 := r.db.QueryRow(ctx, `SELECT status FROM event_invitations WHERE id = $1`, id).Scan(&status)
		if errors.Is(err2, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return status, err2
	}
	return status, err
}

// SetStatus updates the invitation status. Use 'accepted' or 'declined'.
func (r *EventInvitationRepository) SetStatus(ctx context.Context, id, status string) error {
	res, err := r.db.Exec(ctx, `
		UPDATE event_invitations
		   SET status = $2,
		       decided_at = NOW()
		 WHERE id = $1
	`, id, status)
	if err != nil {
		return fmt.Errorf("update invitation status: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListByEvent returns all invitations for the given event with the invitee's
// display name + avatar joined in.
func (r *EventInvitationRepository) ListByEvent(ctx context.Context, eventID string) ([]*model.EventInvitationListItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.event_id, i.inviter_user_id, i.invitee_user_id, i.token,
		       i.status, i.expires_at, i.created_at, i.decided_at,
		       u.display_name, u.avatar_url
		  FROM event_invitations i
		  JOIN users u ON u.id = i.invitee_user_id
		 WHERE i.event_id = $1
		 ORDER BY i.created_at DESC
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	defer rows.Close()
	var out []*model.EventInvitationListItem
	for rows.Next() {
		var item model.EventInvitationListItem
		if err := rows.Scan(
			&item.ID, &item.EventID, &item.InviterUserID, &item.InviteeUserID, &item.Token,
			&item.Status, &item.ExpiresAt, &item.CreatedAt, &item.DecidedAt,
			&item.InviteeDisplayName, &item.InviteeAvatarURL,
		); err != nil {
			return nil, fmt.Errorf("scan invitation row: %w", err)
		}
		out = append(out, &item)
	}
	return out, rows.Err()
}

// PotentialInvitees returns the audience for the invite step, depending on
// the source. Excludes the inviter and existing participants. Already-invited
// rows are flagged so the UI can disable them.
//
//   - "club":      members of the event's club. clubID must be non-empty.
//   - "followers": users who follow the inviter.
//   - "following": users the inviter follows.
//   - "search":    public-profile users matching q (case-insensitive).
func (r *EventInvitationRepository) PotentialInvitees(
	ctx context.Context, eventID, inviterID, source, clubID, q string, limit int,
) ([]*model.PotentialInvitee, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows pgx.Rows
	var err error
	switch source {
	case model.PotentialInviteeSourceClub:
		if clubID == "" {
			return []*model.PotentialInvitee{}, nil
		}
		rows, err = r.db.Query(ctx, `
			SELECT u.id, u.display_name, u.avatar_url,
			       EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id = $1 AND i.invitee_user_id = u.id) AS already_invited,
			       EXISTS(SELECT 1 FROM event_participants p WHERE p.event_id = $1 AND p.user_id = u.id) AS already_participant
			  FROM club_members cm
			  JOIN users u ON u.id = cm.user_id
			 WHERE cm.club_id = $2
			   AND u.id <> $3
			 ORDER BY u.display_name ASC
			 LIMIT $4
		`, eventID, clubID, inviterID, limit)
	case model.PotentialInviteeSourceFollowers:
		rows, err = r.db.Query(ctx, `
			SELECT u.id, u.display_name, u.avatar_url,
			       EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id = $1 AND i.invitee_user_id = u.id) AS already_invited,
			       EXISTS(SELECT 1 FROM event_participants p WHERE p.event_id = $1 AND p.user_id = u.id) AS already_participant
			  FROM user_follows f
			  JOIN users u ON u.id = f.follower_id
			 WHERE f.following_id = $2
			   AND u.id <> $2
			 ORDER BY u.display_name ASC
			 LIMIT $3
		`, eventID, inviterID, limit)
	case model.PotentialInviteeSourceFollowing:
		rows, err = r.db.Query(ctx, `
			SELECT u.id, u.display_name, u.avatar_url,
			       EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id = $1 AND i.invitee_user_id = u.id) AS already_invited,
			       EXISTS(SELECT 1 FROM event_participants p WHERE p.event_id = $1 AND p.user_id = u.id) AS already_participant
			  FROM user_follows f
			  JOIN users u ON u.id = f.following_id
			 WHERE f.follower_id = $2
			   AND u.id <> $2
			 ORDER BY u.display_name ASC
			 LIMIT $3
		`, eventID, inviterID, limit)
	case model.PotentialInviteeSourceSearch:
		needle := strings.TrimSpace(q)
		if needle == "" {
			return []*model.PotentialInvitee{}, nil
		}
		rows, err = r.db.Query(ctx, `
			SELECT u.id, u.display_name, u.avatar_url,
			       EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id = $1 AND i.invitee_user_id = u.id) AS already_invited,
			       EXISTS(SELECT 1 FROM event_participants p WHERE p.event_id = $1 AND p.user_id = u.id) AS already_participant
			  FROM users u
			 WHERE u.profile_visibility = 'public'
			   AND u.id <> $2
			   AND u.display_name ILIKE '%' || $3 || '%'
			 ORDER BY u.display_name ASC
			 LIMIT $4
		`, eventID, inviterID, needle, limit)
	default:
		return nil, fmt.Errorf("unknown invitee source %q", source)
	}
	if err != nil {
		return nil, fmt.Errorf("query potential invitees: %w", err)
	}
	defer rows.Close()
	var out []*model.PotentialInvitee
	for rows.Next() {
		var p model.PotentialInvitee
		if err := rows.Scan(&p.UserID, &p.DisplayName, &p.AvatarURL, &p.IsAlreadyInvited, &p.IsAlreadyParticipant); err != nil {
			return nil, fmt.Errorf("scan invitee row: %w", err)
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}
