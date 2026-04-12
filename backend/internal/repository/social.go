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
		`SELECT id, display_name, bio, location, club, avatar_url, created_at
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&p.ID, &p.DisplayName, &p.Bio, &p.Location, &p.Club, &p.AvatarURL, &p.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get public profile: %w", err)
	}
	return &p, nil
}
