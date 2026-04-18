package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("already exists")

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, email, displayName, passwordHash string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (email, display_name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
	`, email, displayName, passwordHash).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
		FROM users WHERE email = $1
	`, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) UpdateMe(ctx context.Context, id string, in *model.UpdateProfileInput) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET
			display_name             = COALESCE($2, display_name),
			bio                      = COALESCE($3, bio),
			location                 = COALESCE($4, location),
			club                     = COALESCE($5, club),
			profile_visibility       = COALESCE($6, profile_visibility),
			default_score_visibility = COALESCE($7, default_score_visibility),
			feed_opt_out             = COALESCE($8, feed_opt_out),
			show_follower_counts     = COALESCE($9, show_follower_counts),
			default_distance_unit    = COALESCE($10, default_distance_unit),
			default_measurement_unit = COALESCE($11, default_measurement_unit),
			date_format              = COALESCE($12, date_format),
			time_format              = COALESCE($13, time_format),
			timezone                 = COALESCE($14, timezone),
			updated_at               = NOW()
		WHERE id = $1
		RETURNING id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
	`, id, in.DisplayName, in.Bio, in.Location, in.Club, in.ProfileVisibility, in.DefaultScoreVisibility, in.FeedOptOut, in.ShowFollowerCounts, in.DefaultDistanceUnit, in.DefaultMeasurementUnit, in.DateFormat, in.TimeFormat, in.Timezone).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update user: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) UpdateAvatarURL(ctx context.Context, id, avatarURL string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET avatar_url = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
	`, id, avatarURL).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update avatar url: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) UpdatePasswordHash(ctx context.Context, id, passwordHash string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE users
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, id, passwordHash)
	if err != nil {
		return fmt.Errorf("update password hash: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *UserRepository) UpdateEmail(ctx context.Context, id, email string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET email = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, email, password_hash, role, display_name, bio, location, club, avatar_url, profile_visibility, default_score_visibility, feed_opt_out, show_follower_counts, star_level, default_distance_unit, default_measurement_unit, date_format, time_format, timezone, created_at, updated_at
	`, id, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.ProfileVisibility,
		&u.DefaultScoreVisibility, &u.FeedOptOut, &u.ShowFollowerCounts, &u.StarLevel, &u.DefaultDistanceUnit, &u.DefaultMeasurementUnit, &u.DateFormat, &u.TimeFormat, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("update email: %w", err)
	}
	return &u, nil
}

// Search finds users whose display_name prefix-matches query. Private profiles
// are excluded from prefix matches but still findable by exact display_name.
// Users blocked in either direction relative to viewerID are excluded.
func (r *UserRepository) Search(ctx context.Context, query, viewerID string, limit int) ([]*model.PublicProfile, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, display_name, bio, location, club, avatar_url,
		       profile_visibility, show_follower_counts, star_level, created_at
		FROM users
		WHERE LOWER(display_name) LIKE LOWER($1) || '%'
		  AND (profile_visibility <> 'private' OR LOWER(display_name) = LOWER($1))
		  AND ($2 = ''
		       OR id NOT IN (
		           SELECT blocker_id FROM user_blocks WHERE blocked_id = $2::uuid
		           UNION
		           SELECT blocked_id FROM user_blocks WHERE blocker_id = $2::uuid
		       ))
		ORDER BY display_name ASC
		LIMIT $3
	`, query, viewerID, limit)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var results []*model.PublicProfile
	for rows.Next() {
		var p model.PublicProfile
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.Bio, &p.Location, &p.Club,
			&p.AvatarURL, &p.ProfileVisibility, &p.ShowFollowerCounts, &p.StarLevel, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		results = append(results, &p)
	}
	return results, rows.Err()
}

// UpdateStarLevel recalculates and stores the star_level for a user based on their
// earned achievement count. Called after any achievement is awarded.
func (r *UserRepository) UpdateStarLevel(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET star_level = LEAST(5, (
			SELECT COUNT(*)::int / 3
			FROM user_achievements
			WHERE user_id = $1
		))
		WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("update star level: %w", err)
	}
	return nil
}

// ListAll returns a paginated list of all users for admin use, plus the total count.
func (r *UserRepository) ListAll(ctx context.Context, limit, offset int) ([]*model.AdminUser, int, error) {
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, email, role, display_name, bio, location, club, avatar_url, created_at, updated_at
		FROM users
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list all users: %w", err)
	}
	defer rows.Close()

	var users []*model.AdminUser
	for rows.Next() {
		var u model.AdminUser
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName,
			&u.Bio, &u.Location, &u.Club, &u.AvatarURL,
			&u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan admin user: %w", err)
		}
		users = append(users, &u)
	}
	return users, total, rows.Err()
}

// GetAdminByID returns the full user record (including email) for admin use.
func (r *UserRepository) GetAdminByID(ctx context.Context, id string) (*model.AdminUser, error) {
	var u model.AdminUser
	err := r.db.QueryRow(ctx, `
		SELECT id, email, role, display_name, bio, location, club, avatar_url, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL,
		&u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get admin user by id: %w", err)
	}
	return &u, nil
}

// UpdateRole sets a user's role and returns the updated record.
func (r *UserRepository) UpdateRole(ctx context.Context, id, role string) (*model.AdminUser, error) {
	var u model.AdminUser
	err := r.db.QueryRow(ctx, `
		UPDATE users SET role = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, email, role, display_name, bio, location, club, avatar_url, created_at, updated_at
	`, id, role).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL,
		&u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update user role: %w", err)
	}
	return &u, nil
}

// Delete removes a user by ID.
func (r *UserRepository) Delete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDelete marks the user as deleted for GDPR-compliant account removal.
// The row is retained (to preserve referential integrity for score cards,
// comments, etc.) but the login path rejects the user and public reads
// treat the profile as absent. Display name is scrubbed to a tombstone.
func (r *UserRepository) SoftDelete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE users
		SET deleted_at            = NOW(),
		    deletion_requested_at = COALESCE(deletion_requested_at, NOW()),
		    email                 = 'deleted-' || id || '@removed.invalid',
		    password_hash         = NULL,
		    display_name          = 'Deleted user',
		    bio                   = NULL,
		    location              = NULL,
		    club                  = NULL,
		    avatar_url            = NULL,
		    profile_visibility    = 'private',
		    feed_opt_out          = TRUE,
		    updated_at            = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("soft delete user: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IsDeleted reports whether a user has been soft-deleted.
func (r *UserRepository) IsDeleted(ctx context.Context, id string) (bool, error) {
	var deleted bool
	err := r.db.QueryRow(ctx, `
		SELECT deleted_at IS NOT NULL FROM users WHERE id = $1
	`, id).Scan(&deleted)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrNotFound
		}
		return false, fmt.Errorf("is deleted: %w", err)
	}
	return deleted, nil
}

// CreateExportRequest records that a user requested a copy of their data.
func (r *UserRepository) CreateExportRequest(ctx context.Context, userID string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO data_export_requests (user_id, status, completed_at)
		VALUES ($1, 'completed', NOW())
		RETURNING id
	`, userID).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create export request: %w", err)
	}
	return id, nil
}

// isUniqueViolation checks for PostgreSQL unique constraint error (code 23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
