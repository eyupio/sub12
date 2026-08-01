package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// ErrClubLastAdmin is returned when a demote or leave would remove the last
// remaining admin from a club.
var ErrClubLastAdmin = errors.New("cannot remove the last club admin")

// ErrClubMemberNotFound is returned when a targeted club_members row is missing.
var ErrClubMemberNotFound = errors.New("club member not found")

type ClubRepository struct {
	db *pgxpool.Pool
}

func NewClubRepository(db *pgxpool.Pool) *ClubRepository {
	return &ClubRepository{db: db}
}

func (r *ClubRepository) Create(ctx context.Context, userID string, input *model.CreateClubInput) (*model.Club, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	clubType := "public"
	if input.Type != nil && *input.Type == "private" {
		clubType = "private"
	}
	joinPolicy := "open"
	if input.JoinPolicy != nil {
		switch *input.JoinPolicy {
		case "open", "invite_code", "approval":
			joinPolicy = *input.JoinPolicy
		}
	}

	var club model.Club
	err = tx.QueryRow(ctx, `
		INSERT INTO clubs (name, description, created_by, type, join_policy)
		VALUES ($1, $2, $3, $4::club_type, $5::club_join_policy)
		RETURNING id, name, coalesce(slug, ''), description, image_url, join_code,
		          type::text, join_policy::text, post_visibility,
		          date_format, time_format, timezone,
		          created_by, created_at::text, updated_at::text
	`, input.Name, input.Description, userID, clubType, joinPolicy).Scan(
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert club: %w", err)
	}

	if club.Slug, err = syncShareSlug(ctx, tx, SlugEntityClub, club.ID, club.Name, club.Slug); err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO club_members (club_id, user_id, is_admin) VALUES ($1, $2, true)
	`, club.ID, userID)
	if err != nil {
		return nil, fmt.Errorf("insert club admin member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	club.MemberCount = 1
	club.IsAdmin = true
	club.IsMember = true
	return &club, nil
}

func (r *ClubRepository) GetByID(ctx context.Context, clubID, viewerID string) (*model.Club, error) {
	clubID, err := resolveEntityRef(ctx, r.db, SlugEntityClub, clubID)
	if err != nil {
		return nil, err
	}
	var club model.Club
	if viewerID == "" {
		// Unauthenticated: skip member/admin subqueries to avoid invalid UUID cast
		err := r.db.QueryRow(ctx, `
			SELECT
				c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
				c.type::text, c.join_policy::text, c.post_visibility,
				c.date_format, c.time_format, c.timezone,
				c.created_by, c.created_at::text, c.updated_at::text,
				(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count
			FROM clubs c
			WHERE c.id = $1
		`, clubID).Scan(
			&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
			&club.DateFormat, &club.TimeFormat, &club.Timezone,
			&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, fmt.Errorf("get club: %w", err)
		}
		return &club, nil
	}

	err = r.db.QueryRow(ctx, `
		SELECT
			c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
			c.type::text, c.join_policy::text, c.post_visibility,
			c.date_format, c.time_format, c.timezone,
			c.created_by, c.created_at::text, c.updated_at::text,
			(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $2::uuid), false) AS is_admin,
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $2::uuid) AS is_member
		FROM clubs c
		WHERE c.id = $1
	`, clubID, viewerID).Scan(
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.MemberCount, &club.IsAdmin, &club.IsMember,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get club: %w", err)
	}
	return &club, nil
}

// GetByJoinCode returns a single club matched by join_code (case-insensitive),
// regardless of privacy. When viewerID is non-empty, IsAdmin and IsMember are
// populated for the viewer; otherwise both are false. Returns ErrNotFound when
// no row matches.
func (r *ClubRepository) GetByJoinCode(ctx context.Context, code, viewerID string) (*model.Club, error) {
	var club model.Club
	if viewerID == "" {
		err := r.db.QueryRow(ctx, `
			SELECT
				c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
				c.type::text, c.join_policy::text, c.post_visibility,
				c.date_format, c.time_format, c.timezone,
				c.created_by, c.created_at::text, c.updated_at::text,
				(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count
			FROM clubs c
			WHERE UPPER(c.join_code) = UPPER($1)
			LIMIT 1
		`, code).Scan(
			&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
			&club.DateFormat, &club.TimeFormat, &club.Timezone,
			&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, fmt.Errorf("get club by join code: %w", err)
		}
		return &club, nil
	}

	err := r.db.QueryRow(ctx, `
		SELECT
			c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
			c.type::text, c.join_policy::text, c.post_visibility,
			c.date_format, c.time_format, c.timezone,
			c.created_by, c.created_at::text, c.updated_at::text,
			(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $2::uuid), false) AS is_admin,
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $2::uuid) AS is_member
		FROM clubs c
		WHERE UPPER(c.join_code) = UPPER($1)
		LIMIT 1
	`, code, viewerID).Scan(
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.MemberCount, &club.IsAdmin, &club.IsMember,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get club by join code: %w", err)
	}
	return &club, nil
}

func (r *ClubRepository) List(ctx context.Context, viewerID string) ([]*model.Club, error) {
	if viewerID == "" {
		// Public clubs directory: hide private clubs from unauthenticated viewers.
		rows, err := r.db.Query(ctx, `
			SELECT
				c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
				c.type::text, c.join_policy::text, c.post_visibility,
				c.date_format, c.time_format, c.timezone,
				c.created_by, c.created_at::text, c.updated_at::text,
				COUNT(cm.user_id)::int AS member_count
			FROM clubs c
			LEFT JOIN club_members cm ON cm.club_id = c.id
			WHERE c.type = 'public'
			GROUP BY c.id
			ORDER BY c.created_at DESC
		`)
		if err != nil {
			return nil, fmt.Errorf("list clubs: %w", err)
		}
		defer rows.Close()

		var clubs []*model.Club
		for rows.Next() {
			var club model.Club
			if err := rows.Scan(
				&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
				&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
				&club.DateFormat, &club.TimeFormat, &club.Timezone,
				&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
				&club.MemberCount,
			); err != nil {
				return nil, fmt.Errorf("scan club: %w", err)
			}
			clubs = append(clubs, &club)
		}
		return clubs, rows.Err()
	}

	// Authenticated viewers see public clubs + private clubs they belong to.
	rows, err := r.db.Query(ctx, `
		SELECT
			c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
			c.type::text, c.join_policy::text, c.post_visibility,
			c.date_format, c.time_format, c.timezone,
			c.created_by, c.created_at::text, c.updated_at::text,
			COUNT(cm.user_id)::int AS member_count,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $1::uuid), false) AS is_admin,
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $1::uuid) AS is_member
		FROM clubs c
		LEFT JOIN club_members cm ON cm.club_id = c.id
		WHERE c.type = 'public'
		   OR EXISTS (SELECT 1 FROM club_members cm2 WHERE cm2.club_id = c.id AND cm2.user_id = $1::uuid)
		GROUP BY c.id
		ORDER BY c.created_at DESC
	`, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list clubs: %w", err)
	}
	defer rows.Close()

	var clubs []*model.Club
	for rows.Next() {
		var club model.Club
		if err := rows.Scan(
			&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
			&club.DateFormat, &club.TimeFormat, &club.Timezone,
			&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount, &club.IsAdmin, &club.IsMember,
		); err != nil {
			return nil, fmt.Errorf("scan club: %w", err)
		}
		clubs = append(clubs, &club)
	}
	return clubs, rows.Err()
}

func (r *ClubRepository) ListByUser(ctx context.Context, userID string) ([]*model.Club, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
			c.type::text, c.join_policy::text, c.post_visibility,
			c.date_format, c.time_format, c.timezone,
			c.created_by, c.created_at::text, c.updated_at::text,
			(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count,
			cm.is_admin
		FROM clubs c
		JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = $1
		ORDER BY cm.joined_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list clubs by user: %w", err)
	}
	defer rows.Close()

	var clubs []*model.Club
	for rows.Next() {
		var club model.Club
		if err := rows.Scan(
			&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
			&club.DateFormat, &club.TimeFormat, &club.Timezone,
			&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount, &club.IsAdmin,
		); err != nil {
			return nil, fmt.Errorf("scan club: %w", err)
		}
		club.IsMember = true
		clubs = append(clubs, &club)
	}
	return clubs, rows.Err()
}

// Join adds a user to a club. Returns ErrNotFound if the club doesn't exist,
// ErrAlreadyMember if the user is already in it.
func (r *ClubRepository) Join(ctx context.Context, clubID, userID string) error {
	var exists bool
	if err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM clubs WHERE id = $1)`, clubID).Scan(&exists); err != nil {
		return fmt.Errorf("check club exists: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO club_members (club_id, user_id, is_admin) VALUES ($1, $2, false)
	`, clubID, userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrAlreadyMember
		}
		return fmt.Errorf("join club: %w", err)
	}
	return nil
}

func (r *ClubRepository) IsAdmin(ctx context.Context, clubID, userID string) (bool, error) {
	var isAdmin bool
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE((SELECT is_admin FROM club_members WHERE club_id = $1 AND user_id = $2), false)
	`, clubID, userID).Scan(&isAdmin)
	return isAdmin, err
}

func (r *ClubRepository) IsMember(ctx context.Context, clubID, userID string) (bool, error) {
	var isMember bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2)
	`, clubID, userID).Scan(&isMember)
	return isMember, err
}

// ListAdminIDs returns the user IDs of all admins for a club.
func (r *ClubRepository) ListAdminIDs(ctx context.Context, clubID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT user_id FROM club_members WHERE club_id = $1 AND is_admin = TRUE
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("list club admin ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan club admin id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CountMembershipsByUser returns how many clubs the user has joined.
func (r *ClubRepository) CountMembershipsByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM club_members WHERE user_id = $1`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count club memberships: %w", err)
	}
	return count, nil
}

func (r *ClubRepository) ListMembers(ctx context.Context, clubID string) ([]*model.ClubMember, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.display_name, u.avatar_url, cm.is_admin, cm.joined_at::text
		FROM club_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.club_id = $1
		ORDER BY cm.is_admin DESC, cm.joined_at ASC
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []*model.ClubMember
	for rows.Next() {
		var m model.ClubMember
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.AvatarURL, &m.IsAdmin, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *ClubRepository) GetStandings(ctx context.Context, clubID string) ([]*model.ClubStanding, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			ROW_NUMBER() OVER (ORDER BY MAX(sc.total_score) DESC NULLS LAST, MAX(sc.x_count) DESC NULLS LAST)::int AS rank,
			u.id, u.display_name, u.avatar_url,
			MAX(sc.total_score)::smallint AS best_score,
			MAX(sc.x_count)::smallint    AS best_x,
			COUNT(sc.id)::int            AS card_count
		FROM club_members cm
		JOIN users u ON u.id = cm.user_id
		LEFT JOIN score_cards sc ON sc.user_id = cm.user_id AND sc.verification = 'verified'
			AND (sc.club_id = $1 OR sc.club_id IS NULL)
		WHERE cm.club_id = $1
		GROUP BY u.id, u.display_name, u.avatar_url
		ORDER BY rank
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("get standings: %w", err)
	}
	defer rows.Close()

	var standings []*model.ClubStanding
	for rows.Next() {
		var s model.ClubStanding
		if err := rows.Scan(&s.Rank, &s.UserID, &s.DisplayName, &s.AvatarURL, &s.BestScore, &s.BestX, &s.CardCount); err != nil {
			return nil, fmt.Errorf("scan standing: %w", err)
		}
		standings = append(standings, &s)
	}
	return standings, rows.Err()
}

func (r *ClubRepository) RemoveMember(ctx context.Context, clubID, userID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM club_members WHERE club_id = $1 AND user_id = $2
	`, clubID, userID)
	return err
}

func (r *ClubRepository) UpdateImageURL(ctx context.Context, clubID, url string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE clubs SET image_url = $1, updated_at = NOW() WHERE id = $2
	`, url, clubID)
	return err
}

// CountAdmins returns how many admins a club currently has.
func (r *ClubRepository) CountAdmins(ctx context.Context, clubID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM club_members WHERE club_id = $1 AND is_admin = true
	`, clubID).Scan(&count)
	return count, err
}

// UpdateMemberRole sets is_admin for a specific club member.
func (r *ClubRepository) UpdateMemberRole(ctx context.Context, clubID, userID string, isAdmin bool) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE club_members SET is_admin = $3 WHERE club_id = $1 AND user_id = $2
	`, clubID, userID, isAdmin)
	if err != nil {
		return fmt.Errorf("update member role: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("member not found")
	}
	return nil
}

// DemoteMemberGuarded sets is_admin = false for the target member atomically
// with a last-admin check. Returns ErrClubLastAdmin if the target is the sole
// remaining admin, ErrClubMemberNotFound if the target isn't a member.
func (r *ClubRepository) DemoteMemberGuarded(ctx context.Context, clubID, userID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock all admin rows for this club so concurrent demote/leave operations
	// serialize and cannot both pass the last-admin check.
	adminRows, err := tx.Query(ctx, `
		SELECT user_id FROM club_members
		WHERE club_id = $1 AND is_admin = TRUE
		FOR UPDATE
	`, clubID)
	if err != nil {
		return fmt.Errorf("lock admins: %w", err)
	}
	adminIDs := make(map[string]struct{})
	for adminRows.Next() {
		var id string
		if err := adminRows.Scan(&id); err != nil {
			adminRows.Close()
			return fmt.Errorf("scan admin: %w", err)
		}
		adminIDs[id] = struct{}{}
	}
	adminRows.Close()
	if err := adminRows.Err(); err != nil {
		return fmt.Errorf("iter admins: %w", err)
	}

	// Confirm the target is a member at all.
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2)
	`, clubID, userID).Scan(&exists); err != nil {
		return fmt.Errorf("check member: %w", err)
	}
	if !exists {
		return ErrClubMemberNotFound
	}

	if _, isAdmin := adminIDs[userID]; isAdmin && len(adminIDs) <= 1 {
		return ErrClubLastAdmin
	}

	if _, err := tx.Exec(ctx, `
		UPDATE club_members SET is_admin = FALSE WHERE club_id = $1 AND user_id = $2
	`, clubID, userID); err != nil {
		return fmt.Errorf("demote member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// LeaveClubGuarded removes the caller's membership atomically with a
// last-admin check. Returns ErrClubLastAdmin if the user is an admin and the
// sole admin, ErrClubMemberNotFound if the user isn't a member.
func (r *ClubRepository) LeaveClubGuarded(ctx context.Context, clubID, userID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	adminRows, err := tx.Query(ctx, `
		SELECT user_id FROM club_members
		WHERE club_id = $1 AND is_admin = TRUE
		FOR UPDATE
	`, clubID)
	if err != nil {
		return fmt.Errorf("lock admins: %w", err)
	}
	adminIDs := make(map[string]struct{})
	for adminRows.Next() {
		var id string
		if err := adminRows.Scan(&id); err != nil {
			adminRows.Close()
			return fmt.Errorf("scan admin: %w", err)
		}
		adminIDs[id] = struct{}{}
	}
	adminRows.Close()
	if err := adminRows.Err(); err != nil {
		return fmt.Errorf("iter admins: %w", err)
	}

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2)
	`, clubID, userID).Scan(&exists); err != nil {
		return fmt.Errorf("check member: %w", err)
	}
	if !exists {
		return ErrClubMemberNotFound
	}

	if _, isAdmin := adminIDs[userID]; isAdmin && len(adminIDs) <= 1 {
		return ErrClubLastAdmin
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM club_members WHERE club_id = $1 AND user_id = $2
	`, clubID, userID); err != nil {
		return fmt.Errorf("delete member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// AdminUpdate applies a partial update to any club.
func (r *ClubRepository) AdminUpdate(ctx context.Context, id string, in *model.UpdateClubInput) (*model.Club, error) {
	var club model.Club
	err := r.db.QueryRow(ctx, `
		UPDATE clubs
		SET name            = COALESCE($2, name),
		    description     = COALESCE($3, description),
		    type            = COALESCE($4::club_type, type),
		    join_policy     = COALESCE($5::club_join_policy, join_policy),
		    post_visibility = COALESCE($6, post_visibility),
		    date_format     = COALESCE($7, date_format),
		    time_format     = COALESCE($8, time_format),
		    timezone        = COALESCE($9, timezone),
		    updated_at      = NOW()
		WHERE id = $1
		RETURNING id, name, coalesce(slug, ''), description, image_url, join_code,
		          type::text, join_policy::text, post_visibility,
		          date_format, time_format, timezone,
		          created_by, created_at::text, updated_at::text,
		          (SELECT COUNT(*) FROM club_members WHERE club_id = $1)::int
	`, id, in.Name, in.Description, in.Type, in.JoinPolicy, in.PostVisibility, in.DateFormat, in.TimeFormat, in.Timezone).Scan(
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.MemberCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("admin update club: %w", err)
	}

	// Renaming re-derives the slug; the previous one stays in
	// share_slug_aliases so links already shared keep resolving.
	if club.Slug, err = syncShareSlug(ctx, r.db, SlugEntityClub, club.ID, club.Name, club.Slug); err != nil {
		return nil, err
	}
	return &club, nil
}

// RegenerateJoinCode replaces the club join code with a fresh random value and returns it.
func (r *ClubRepository) RegenerateJoinCode(ctx context.Context, clubID string) (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random code: %w", err)
	}
	code := hex.EncodeToString(b)

	ct, err := r.db.Exec(ctx,
		`UPDATE clubs SET join_code = $2, updated_at = NOW() WHERE id = $1`,
		clubID, code,
	)
	if err != nil {
		return "", fmt.Errorf("update join code: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return "", ErrNotFound
	}
	return code, nil
}

// AdminDelete removes a club by ID.
func (r *ClubRepository) AdminDelete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM clubs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete club: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("club not found")
	}
	return nil
}

// CreateJoinRequest inserts a pending join request for an approval-based club.
// Returns ErrConflict if the same user already has a pending/approved request.
func (r *ClubRepository) CreateJoinRequest(ctx context.Context, clubID, userID string) (*model.ClubJoinRequest, error) {
	var req model.ClubJoinRequest
	err := r.db.QueryRow(ctx, `
		INSERT INTO club_join_requests (club_id, user_id)
		VALUES ($1, $2)
		RETURNING id, club_id, user_id, status, decided_by, decided_at, created_at
	`, clubID, userID).Scan(
		&req.ID, &req.ClubID, &req.UserID, &req.Status,
		&req.DecidedBy, &req.DecidedAt, &req.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create club join request: %w", err)
	}
	return &req, nil
}

// ListJoinRequests returns join requests for a club, optionally filtered by status.
func (r *ClubRepository) ListJoinRequests(ctx context.Context, clubID, status string) ([]*model.ClubJoinRequest, error) {
	var (
		rows pgx.Rows
		err  error
	)
	if status != "" {
		rows, err = r.db.Query(ctx, `
			SELECT jr.id, jr.club_id, jr.user_id, u.display_name, u.avatar_url,
			       jr.status, jr.decided_by, jr.decided_at, jr.created_at
			FROM club_join_requests jr
			JOIN users u ON u.id = jr.user_id
			WHERE jr.club_id = $1 AND jr.status = $2
			ORDER BY jr.created_at DESC
		`, clubID, status)
	} else {
		rows, err = r.db.Query(ctx, `
			SELECT jr.id, jr.club_id, jr.user_id, u.display_name, u.avatar_url,
			       jr.status, jr.decided_by, jr.decided_at, jr.created_at
			FROM club_join_requests jr
			JOIN users u ON u.id = jr.user_id
			WHERE jr.club_id = $1
			ORDER BY jr.created_at DESC
		`, clubID)
	}
	if err != nil {
		return nil, fmt.Errorf("list club join requests: %w", err)
	}
	defer rows.Close()

	var items []*model.ClubJoinRequest
	for rows.Next() {
		var req model.ClubJoinRequest
		if err := rows.Scan(
			&req.ID, &req.ClubID, &req.UserID, &req.DisplayName, &req.AvatarURL,
			&req.Status, &req.DecidedBy, &req.DecidedAt, &req.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan club join request: %w", err)
		}
		items = append(items, &req)
	}
	return items, rows.Err()
}

// DecideJoinRequest updates a pending join request to approved or rejected.
// On approval the caller is responsible for inserting the club_members row.
func (r *ClubRepository) DecideJoinRequest(ctx context.Context, requestID, adminID, decision string) (*model.ClubJoinRequest, error) {
	var req model.ClubJoinRequest
	err := r.db.QueryRow(ctx, `
		UPDATE club_join_requests
		SET status = $2, decided_by = $3::uuid, decided_at = NOW()
		WHERE id = $1 AND status = 'pending'
		RETURNING id, club_id, user_id, status, decided_by, decided_at, created_at
	`, requestID, decision, adminID).Scan(
		&req.ID, &req.ClubID, &req.UserID, &req.Status,
		&req.DecidedBy, &req.DecidedAt, &req.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("decide club join request: %w", err)
	}
	return &req, nil
}

// GetJoinRequestStatus returns the user's latest request status for a club, or
// empty string if none exists.
func (r *ClubRepository) GetJoinRequestStatus(ctx context.Context, clubID, userID string) (string, error) {
	var status string
	err := r.db.QueryRow(ctx, `
		SELECT status FROM club_join_requests
		WHERE club_id = $1 AND user_id = $2
		ORDER BY created_at DESC LIMIT 1
	`, clubID, userID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get join request status: %w", err)
	}
	return status, nil
}
