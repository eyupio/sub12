package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type SocialRepository struct {
	db *pgxpool.Pool
}

func NewSocialRepository(db *pgxpool.Pool) *SocialRepository {
	return &SocialRepository{db: db}
}

// Follow creates a follower → following relationship. Idempotent (ON CONFLICT DO NOTHING).
func (r *SocialRepository) Follow(ctx context.Context, followerID, followingID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		followerID, followingID,
	)
	if err != nil {
		return fmt.Errorf("follow: %w", err)
	}
	return nil
}

// Unfollow removes a follower → following relationship. Returns ErrNotFound if it did not exist.
func (r *SocialRepository) Unfollow(ctx context.Context, followerID, followingID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
		followerID, followingID,
	)
	if err != nil {
		return fmt.Errorf("unfollow: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IsFollowing returns true if followerID follows followingID.
func (r *SocialRepository) IsFollowing(ctx context.Context, followerID, followingID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2)`,
		followerID, followingID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("is following: %w", err)
	}
	return exists, nil
}

// GetFollowStats returns follower/following counts and whether viewerID follows profileUserID.
// Pass viewerID as "" for unauthenticated calls (is_following will be false).
func (r *SocialRepository) GetFollowStats(ctx context.Context, profileUserID, viewerID string) (*model.FollowStats, error) {
	var stats model.FollowStats
	err := r.db.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM user_follows WHERE following_id = $1) AS follower_count,
			(SELECT COUNT(*) FROM user_follows WHERE follower_id  = $1) AS following_count,
			CASE WHEN $2 = '' THEN false
			     ELSE EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $2 AND following_id = $1)
			END AS is_following
	`, profileUserID, viewerID).Scan(&stats.FollowerCount, &stats.FollowingCount, &stats.IsFollowing)
	if err != nil {
		return nil, fmt.Errorf("get follow stats: %w", err)
	}
	return &stats, nil
}

// ListFollowing returns the IDs of all users that userID follows, newest first.
// Used by the activity feed to determine whose posts to show.
func (r *SocialRepository) ListFollowing(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT following_id FROM user_follows WHERE follower_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list following: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan following id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list following rows: %w", err)
	}

	// Ensure we return an empty slice rather than nil
	if ids == nil {
		ids = []string{}
	}
	return ids, nil
}

// GetPublicProfile returns a user's public profile fields.
func (r *SocialRepository) GetPublicProfile(ctx context.Context, userID string) (*model.PublicProfile, error) {
	var p model.PublicProfile
	err := r.db.QueryRow(ctx,
		`SELECT id, display_name, bio, location, club, avatar_url, profile_visibility, show_follower_counts, created_at
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&p.ID, &p.DisplayName, &p.Bio, &p.Location, &p.Club, &p.AvatarURL, &p.ProfileVisibility, &p.ShowFollowerCounts, &p.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get public profile: %w", err)
	}
	return &p, nil
}

// GetProfileVisibility returns just the profile_visibility setting for a user.
func (r *SocialRepository) GetProfileVisibility(ctx context.Context, userID string) (string, error) {
	var vis string
	err := r.db.QueryRow(ctx,
		`SELECT profile_visibility FROM users WHERE id = $1`,
		userID,
	).Scan(&vis)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("get profile visibility: %w", err)
	}
	return vis, nil
}

// CreateFollowRequest inserts a pending follow request. Idempotent via ON CONFLICT.
func (r *SocialRepository) CreateFollowRequest(ctx context.Context, requesterID, targetID string) (*model.FollowRequest, error) {
	var fr model.FollowRequest
	err := r.db.QueryRow(ctx, `
		INSERT INTO follow_requests (requester_id, target_id, status)
		VALUES ($1, $2, 'pending')
		ON CONFLICT (requester_id, target_id)
		DO UPDATE SET status = CASE
			WHEN follow_requests.status = 'rejected' THEN 'pending'
			ELSE follow_requests.status
		END, decided_at = CASE
			WHEN follow_requests.status = 'rejected' THEN NULL
			ELSE follow_requests.decided_at
		END
		RETURNING id, requester_id, target_id, status, created_at, decided_at
	`, requesterID, targetID).Scan(
		&fr.ID, &fr.RequesterID, &fr.TargetID, &fr.Status, &fr.CreatedAt, &fr.DecidedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create follow request: %w", err)
	}
	return &fr, nil
}

// GetPendingRequest returns a pending follow request between two users, or ErrNotFound.
func (r *SocialRepository) GetPendingRequest(ctx context.Context, requesterID, targetID string) (*model.FollowRequest, error) {
	var fr model.FollowRequest
	err := r.db.QueryRow(ctx, `
		SELECT id, requester_id, target_id, status, created_at, decided_at
		FROM follow_requests
		WHERE requester_id = $1 AND target_id = $2 AND status = 'pending'
	`, requesterID, targetID).Scan(
		&fr.ID, &fr.RequesterID, &fr.TargetID, &fr.Status, &fr.CreatedAt, &fr.DecidedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get pending request: %w", err)
	}
	return &fr, nil
}

// ListPendingRequests returns all pending follow requests targeting the given user.
func (r *SocialRepository) ListPendingRequests(ctx context.Context, targetID string) ([]*model.FollowRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT fr.id, fr.requester_id, fr.target_id, fr.status,
		       u.display_name, u.avatar_url, fr.created_at, fr.decided_at
		FROM follow_requests fr
		JOIN users u ON u.id = fr.requester_id
		WHERE fr.target_id = $1 AND fr.status = 'pending'
		ORDER BY fr.created_at DESC
	`, targetID)
	if err != nil {
		return nil, fmt.Errorf("list pending requests: %w", err)
	}
	defer rows.Close()

	var reqs []*model.FollowRequest
	for rows.Next() {
		var fr model.FollowRequest
		if err := rows.Scan(&fr.ID, &fr.RequesterID, &fr.TargetID, &fr.Status,
			&fr.DisplayName, &fr.AvatarURL, &fr.CreatedAt, &fr.DecidedAt); err != nil {
			return nil, fmt.Errorf("scan follow request: %w", err)
		}
		reqs = append(reqs, &fr)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list pending requests rows: %w", err)
	}
	if reqs == nil {
		reqs = []*model.FollowRequest{}
	}
	return reqs, nil
}

// DecideFollowRequest updates a follow request's status to accepted or rejected.
func (r *SocialRepository) DecideFollowRequest(ctx context.Context, requestID, targetID, decision string) (*model.FollowRequest, error) {
	var fr model.FollowRequest
	err := r.db.QueryRow(ctx, `
		UPDATE follow_requests
		SET status = $3, decided_at = NOW()
		WHERE id = $1 AND target_id = $2 AND status = 'pending'
		RETURNING id, requester_id, target_id, status, created_at, decided_at
	`, requestID, targetID, decision).Scan(
		&fr.ID, &fr.RequesterID, &fr.TargetID, &fr.Status, &fr.CreatedAt, &fr.DecidedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("decide follow request: %w", err)
	}
	return &fr, nil
}

// ListFollowers returns a paginated list of users who follow the given user.
func (r *SocialRepository) ListFollowers(ctx context.Context, userID string, limit, offset int) ([]*model.FollowListItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.display_name, u.avatar_url
		FROM user_follows uf
		JOIN users u ON u.id = uf.follower_id
		WHERE uf.following_id = $1
		ORDER BY uf.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list followers: %w", err)
	}
	defer rows.Close()

	var items []*model.FollowListItem
	for rows.Next() {
		var item model.FollowListItem
		if err := rows.Scan(&item.UserID, &item.DisplayName, &item.AvatarURL); err != nil {
			return nil, fmt.Errorf("scan follower: %w", err)
		}
		items = append(items, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list followers rows: %w", err)
	}
	if items == nil {
		items = []*model.FollowListItem{}
	}
	return items, nil
}

// ListFollowingProfiles returns a paginated list of users the given user follows.
func (r *SocialRepository) ListFollowingProfiles(ctx context.Context, userID string, limit, offset int) ([]*model.FollowListItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.display_name, u.avatar_url
		FROM user_follows uf
		JOIN users u ON u.id = uf.following_id
		WHERE uf.follower_id = $1
		ORDER BY uf.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list following profiles: %w", err)
	}
	defer rows.Close()

	var items []*model.FollowListItem
	for rows.Next() {
		var item model.FollowListItem
		if err := rows.Scan(&item.UserID, &item.DisplayName, &item.AvatarURL); err != nil {
			return nil, fmt.Errorf("scan following: %w", err)
		}
		items = append(items, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list following rows: %w", err)
	}
	if items == nil {
		items = []*model.FollowListItem{}
	}
	return items, nil
}

// GetFollowRequestStatus returns the status of a follow request from requesterID to targetID.
// Returns "" if no request exists.
func (r *SocialRepository) GetFollowRequestStatus(ctx context.Context, requesterID, targetID string) (string, error) {
	var status string
	err := r.db.QueryRow(ctx,
		`SELECT status FROM follow_requests WHERE requester_id = $1 AND target_id = $2`,
		requesterID, targetID,
	).Scan(&status)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("get follow request status: %w", err)
	}
	return status, nil
}
