package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

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

// clubColumns is the shared club projection. Every club query selects these in
// this order and scans them through scanClub, so adding a column is a
// single-line change rather than six.
const clubColumns = `
	c.id, c.name, coalesce(c.slug, '') AS slug, c.description, c.image_url, c.join_code,
	c.type::text, c.join_policy::text, c.post_visibility,
	c.date_format, c.time_format, c.timezone,
	c.created_by, c.created_at::text, c.updated_at::text,
	c.website_url, c.contact_email, c.contact_phone,
	c.address_line1, c.address_line2, c.city, c.region, c.postcode, c.country,
	c.latitude, c.longitude,
	c.disciplines, c.distances, c.facilities,
	c.membership_info, c.visitor_policy, c.established_year,
	(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int,
	(SELECT COUNT(*) FROM leagues WHERE club_id = c.id)::int`

// rowScanner covers both pgx.Row and pgx.Rows so scanClub serves single-row
// and multi-row queries alike.
type rowScanner interface {
	Scan(dest ...any) error
}

// scanClub reads the clubColumns projection into club. Any columns a query
// appends after the shared projection are scanned into extra, in order.
func scanClub(row rowScanner, club *model.Club, extra ...any) error {
	dest := []any{
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL, &club.JoinCode,
		&club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.WebsiteURL, &club.ContactEmail, &club.ContactPhone,
		&club.AddressLine1, &club.AddressLine2, &club.City, &club.Region, &club.Postcode, &club.Country,
		&club.Latitude, &club.Longitude,
		&club.Disciplines, &club.Distances, &club.Facilities,
		&club.MembershipInfo, &club.VisitorPolicy, &club.EstablishedYear,
		&club.MemberCount, &club.LeagueCount,
	}
	return row.Scan(append(dest, extra...)...)
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
		          created_by, created_at::text, updated_at::text,
		          disciplines, distances, facilities
	`, input.Name, input.Description, userID, clubType, joinPolicy).Scan(
		&club.ID, &club.Name, &club.Slug, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.Type, &club.JoinPolicy, &club.PostVisibility,
		&club.DateFormat, &club.TimeFormat, &club.Timezone,
		&club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.Disciplines, &club.Distances, &club.Facilities,
	)
	if err != nil {
		return nil, fmt.Errorf("insert club: %w", err)
	}

	if club.Slug, err = syncShareSlug(ctx, tx, SlugEntityClub, club.ID, club.Name, club.Slug); err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO club_members (club_id, user_id, is_admin, moderator_permissions)
		VALUES ($1, $2, true, $3)
	`, club.ID, userID, model.AllModeratorPermissions(model.ClubModeratorPermissions))
	if err != nil {
		return nil, fmt.Errorf("insert club owner member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	club.MemberCount = 1
	club.IsMember = true
	applyViewerRole(&club, userID, nil)
	return &club, nil
}

func (r *ClubRepository) GetByID(ctx context.Context, clubID, viewerID string) (*model.Club, error) {
	clubID, err := resolveEntityRef(ctx, r.db, SlugEntityClub, clubID)
	if err != nil {
		return nil, err
	}
	return r.getOne(ctx, "c.id = $1", clubID, viewerID)
}

// getOne fetches a single club matched by whereClause, which must reference the
// club key as $1. When viewerID is non-empty, IsAdmin and IsMember are
// populated for that viewer; otherwise the member/admin subqueries are skipped
// so an empty string never reaches a UUID cast.
func (r *ClubRepository) getOne(ctx context.Context, whereClause, key, viewerID string) (*model.Club, error) {
	var club model.Club
	var err error

	var permissions []string
	if viewerID == "" {
		query := fmt.Sprintf(`SELECT %s FROM clubs c WHERE %s LIMIT 1`, clubColumns, whereClause)
		err = scanClub(r.db.QueryRow(ctx, query, key), &club)
	} else {
		query := fmt.Sprintf(`
			SELECT %s,
				COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $2::uuid), false),
				EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $2::uuid),
				COALESCE((SELECT moderator_permissions FROM club_members WHERE club_id = c.id AND user_id = $2::uuid), '{}'::text[])
			FROM clubs c
			WHERE %s
			LIMIT 1
		`, clubColumns, whereClause)
		err = scanClub(r.db.QueryRow(ctx, query, key, viewerID), &club, &club.IsAdmin, &club.IsMember, &permissions)
	}

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get club: %w", err)
	}
	applyViewerRole(&club, viewerID, permissions)
	return &club, nil
}

// applyViewerRole derives the viewer's standing from the club's owner and the
// grant on their membership row. The owner runs the club whether or not a
// membership row says so, and holds every delegable capability.
func applyViewerRole(club *model.Club, viewerID string, permissions []string) {
	if viewerID == "" {
		return
	}
	club.IsOwner = club.CreatedBy == viewerID
	if club.IsOwner {
		club.IsAdmin = true
		permissions = model.AllModeratorPermissions(model.ClubModeratorPermissions)
	}
	club.IsModerator = club.IsAdmin
	club.Permissions = permissions
	if club.Permissions == nil {
		club.Permissions = []string{}
	}
}

// GetByJoinCode returns a single club matched by join_code (case-insensitive),
// regardless of privacy. When viewerID is non-empty, IsAdmin and IsMember are
// populated for the viewer; otherwise both are false. Returns ErrNotFound when
// no row matches.
func (r *ClubRepository) GetByJoinCode(ctx context.Context, code, viewerID string) (*model.Club, error) {
	return r.getOne(ctx, "UPPER(c.join_code) = UPPER($1)", code, viewerID)
}

// List returns the club directory visible to viewerID — public clubs plus, for
// authenticated viewers, the private clubs they belong to — narrowed by the
// directory filters. When the query carries coordinates, DistanceKM is
// populated for clubs that published a location and results come back
// nearest-first.
func (r *ClubRepository) List(ctx context.Context, viewerID string, q model.ClubDirectoryQuery) ([]*model.Club, error) {
	var args []any
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	selects := clubColumns
	extras := func(club *model.Club) []any { return nil }
	// Non-empty only when the query carries the viewer's membership columns.
	viewerRole := ""

	visibility := "c.type = 'public'"
	if q.IncludePrivate {
		visibility = "TRUE"
	}
	if viewerID != "" && !q.IncludePrivate {
		viewer := arg(viewerID)
		visibility = fmt.Sprintf(
			"(c.type = 'public' OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = %s::uuid))",
			viewer,
		)
		selects += fmt.Sprintf(`,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = %s::uuid), false),
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = %s::uuid)`, viewer, viewer)
		extras = func(club *model.Club) []any { return []any{&club.IsAdmin, &club.IsMember} }
		viewerRole = viewerID
	}
	where := []string{visibility}

	if s := strings.TrimSpace(q.Search); s != "" {
		p := arg("%" + s + "%")
		where = append(where, fmt.Sprintf(
			"(c.name ILIKE %[1]s OR c.city ILIKE %[1]s OR c.region ILIKE %[1]s OR c.postcode ILIKE %[1]s)", p))
	}
	if d := strings.TrimSpace(q.Discipline); d != "" {
		where = append(where, fmt.Sprintf("c.disciplines @> ARRAY[%s]::text[]", arg(strings.ToLower(d))))
	}

	orderBy := "c.created_at DESC"
	if q.Latitude != nil && q.Longitude != nil {
		lat, lng := arg(*q.Latitude), arg(*q.Longitude)
		// Great-circle distance in km. The clamp keeps acos in domain when
		// floating point nudges the cosine a hair past ±1.
		distance := fmt.Sprintf(`(6371 * acos(LEAST(1, GREATEST(-1,
			cos(radians(%[1]s)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(%[2]s))
			+ sin(radians(%[1]s)) * sin(radians(c.latitude))))))`, lat, lng)
		selects += "\n\t\t\t, CASE WHEN c.latitude IS NULL OR c.longitude IS NULL THEN NULL ELSE " + distance + " END AS distance_km"
		if q.RadiusKM != nil {
			where = append(where, fmt.Sprintf(
				"(c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND %s <= %s)", distance, arg(*q.RadiusKM)))
		}
		orderBy = "distance_km ASC NULLS LAST, c.created_at DESC"

		base := extras
		extras = func(club *model.Club) []any { return append(base(club), &club.DistanceKM) }
	}

	query := fmt.Sprintf(`SELECT %s FROM clubs c WHERE %s ORDER BY %s`,
		selects, strings.Join(where, " AND "), orderBy)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list clubs: %w", err)
	}
	defer rows.Close()

	var clubs []*model.Club
	for rows.Next() {
		var club model.Club
		if err := scanClub(rows, &club, extras(&club)...); err != nil {
			return nil, fmt.Errorf("scan club: %w", err)
		}
		// The directory reports standing but not the grant itself — nothing on
		// a listing card acts on a single capability.
		applyViewerRole(&club, viewerRole, nil)
		clubs = append(clubs, &club)
	}
	return clubs, rows.Err()
}

func (r *ClubRepository) ListByUser(ctx context.Context, userID string) ([]*model.Club, error) {
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT %s, cm.is_admin, COALESCE(cm.moderator_permissions, '{}'::text[])
		FROM clubs c
		JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = $1
		ORDER BY cm.joined_at DESC
	`, clubColumns), userID)
	if err != nil {
		return nil, fmt.Errorf("list clubs by user: %w", err)
	}
	defer rows.Close()

	var clubs []*model.Club
	for rows.Next() {
		var club model.Club
		var permissions []string
		if err := scanClub(rows, &club, &club.IsAdmin, &permissions); err != nil {
			return nil, fmt.Errorf("scan club: %w", err)
		}
		club.IsMember = true
		applyViewerRole(&club, userID, permissions)
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

// GetMemberRole resolves a user's standing in a club: membership, whether they
// were promoted to moderator, whether they own the club, and the capabilities
// the owner delegated to them. A missing club or a stranger yields the zero
// role rather than an error.
func (r *ClubRepository) GetMemberRole(ctx context.Context, clubID, userID string) (*model.MemberRole, error) {
	role := &model.MemberRole{Permissions: []string{}}
	if clubID == "" || userID == "" {
		return role, nil
	}
	clubID, err := resolveEntityRef(ctx, r.db, SlugEntityClub, clubID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return role, nil
		}
		return nil, err
	}
	var permissions []string
	err = r.db.QueryRow(ctx, `
		SELECT c.created_by = $2,
		       cm.user_id IS NOT NULL,
		       COALESCE(cm.is_admin, FALSE),
		       COALESCE(cm.moderator_permissions, '{}'::text[])
		FROM clubs c
		LEFT JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = $2
		WHERE c.id = $1
	`, clubID, userID).Scan(&role.IsOwner, &role.IsMember, &role.IsModerator, &permissions)
	if errors.Is(err, pgx.ErrNoRows) {
		return role, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get club member role: %w", err)
	}
	// The owner runs the club whether or not they hold a membership row, and
	// holds every capability without anything being granted to them.
	if role.IsOwner {
		role.IsModerator = true
		permissions = model.AllModeratorPermissions(model.ClubModeratorPermissions)
	}
	if permissions != nil {
		role.Permissions = permissions
	}
	return role, nil
}

// IsModerator reports whether the user runs the club — its owner, or a member
// promoted to moderator. It says nothing about which capabilities they were
// delegated; use GetMemberRole for that.
func (r *ClubRepository) IsModerator(ctx context.Context, clubID, userID string) (bool, error) {
	role, err := r.GetMemberRole(ctx, clubID, userID)
	if err != nil {
		return false, err
	}
	return role.IsModerator, nil
}

// Can reports whether the user holds one delegated capability in the club.
// Owners always can.
func (r *ClubRepository) Can(ctx context.Context, clubID, userID, permission string) (bool, error) {
	role, err := r.GetMemberRole(ctx, clubID, userID)
	if err != nil {
		return false, err
	}
	return role.Can(permission), nil
}

// SetModeratorPermissions replaces a moderator's delegated capability grant.
// Returns ErrNotFound when the target is not a promoted member.
func (r *ClubRepository) SetModeratorPermissions(ctx context.Context, clubID, userID string, permissions []string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE club_members SET moderator_permissions = $3
		WHERE club_id = $1 AND user_id = $2 AND is_admin = TRUE
	`, clubID, userID, permissions)
	if err != nil {
		return fmt.Errorf("set club moderator permissions: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
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
		SELECT u.id, u.display_name, u.avatar_url, cm.is_admin, cm.joined_at::text,
		       COALESCE(cm.moderator_permissions, '{}'::text[]),
		       cm.user_id = c.created_by
		FROM club_members cm
		JOIN users u ON u.id = cm.user_id
		JOIN clubs c ON c.id = cm.club_id
		WHERE cm.club_id = $1
		ORDER BY cm.user_id = c.created_by DESC, cm.is_admin DESC, cm.joined_at ASC
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []*model.ClubMember
	for rows.Next() {
		var m model.ClubMember
		var permissions []string
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.AvatarURL, &m.IsAdmin, &m.JoinedAt, &permissions, &m.IsOwner); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		m.Permissions = permissions
		if m.Permissions == nil {
			m.Permissions = []string{}
		}
		// The owner runs the club by construction, and holds everything.
		if m.IsOwner {
			m.IsAdmin = true
			m.Permissions = model.AllModeratorPermissions(model.ClubModeratorPermissions)
		}
		m.IsModerator = m.IsAdmin
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

// PromoteMember makes an existing club member a moderator, granting the
// supplied capabilities. Re-promoting an existing moderator re-grants, which
// is how the owner edits a moderator's delegated capabilities.
func (r *ClubRepository) PromoteMember(ctx context.Context, clubID, userID string, permissions []string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE club_members SET is_admin = TRUE, moderator_permissions = $3
		WHERE club_id = $1 AND user_id = $2
	`, clubID, userID, permissions)
	if err != nil {
		return fmt.Errorf("promote club member: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrClubMemberNotFound
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
		UPDATE club_members SET is_admin = FALSE, moderator_permissions = '{}'
		WHERE club_id = $1 AND user_id = $2
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

// AdminUpdate applies a partial update to any club. Text profile fields follow
// the "omit to keep, empty string to clear" convention documented on
// model.UpdateClubInput, which is why they can't just use COALESCE.
func (r *ClubRepository) AdminUpdate(ctx context.Context, id string, in *model.UpdateClubInput) (*model.Club, error) {
	strSlice := func(v *[]string) any {
		if v == nil {
			return nil
		}
		return *v
	}

	if _, err := r.db.Exec(ctx, `
		UPDATE clubs
		SET name             = COALESCE($2, name),
		    description      = CASE WHEN $3::text IS NULL THEN description ELSE NULLIF($3::text, '') END,
		    type             = COALESCE($4::club_type, type),
		    join_policy      = COALESCE($5::club_join_policy, join_policy),
		    post_visibility  = COALESCE($6, post_visibility),
		    date_format      = COALESCE($7, date_format),
		    time_format      = COALESCE($8, time_format),
		    timezone         = COALESCE($9, timezone),
		    website_url      = CASE WHEN $10::text IS NULL THEN website_url   ELSE NULLIF($10::text, '') END,
		    contact_email    = CASE WHEN $11::text IS NULL THEN contact_email ELSE NULLIF($11::text, '') END,
		    contact_phone    = CASE WHEN $12::text IS NULL THEN contact_phone ELSE NULLIF($12::text, '') END,
		    address_line1    = CASE WHEN $13::text IS NULL THEN address_line1 ELSE NULLIF($13::text, '') END,
		    address_line2    = CASE WHEN $14::text IS NULL THEN address_line2 ELSE NULLIF($14::text, '') END,
		    city             = CASE WHEN $15::text IS NULL THEN city          ELSE NULLIF($15::text, '') END,
		    region           = CASE WHEN $16::text IS NULL THEN region        ELSE NULLIF($16::text, '') END,
		    postcode         = CASE WHEN $17::text IS NULL THEN postcode      ELSE NULLIF($17::text, '') END,
		    country          = CASE WHEN $18::text IS NULL THEN country       ELSE NULLIF($18::text, '') END,
		    latitude         = CASE WHEN $21::boolean THEN NULL ELSE COALESCE($19::double precision, latitude)  END,
		    longitude        = CASE WHEN $21::boolean THEN NULL ELSE COALESCE($20::double precision, longitude) END,
		    disciplines      = COALESCE($22::text[], disciplines),
		    distances        = COALESCE($23::text[], distances),
		    facilities       = COALESCE($24::text[], facilities),
		    membership_info  = CASE WHEN $25::text IS NULL THEN membership_info ELSE NULLIF($25::text, '') END,
		    visitor_policy   = CASE WHEN $26::text IS NULL THEN visitor_policy  ELSE NULLIF($26::text, '') END,
		    established_year = CASE WHEN $27::int IS NULL THEN established_year WHEN $27::int = 0 THEN NULL ELSE $27::int END,
		    updated_at       = NOW()
		WHERE id = $1
	`,
		id, in.Name, in.Description, in.Type, in.JoinPolicy, in.PostVisibility,
		in.DateFormat, in.TimeFormat, in.Timezone,
		in.WebsiteURL, in.ContactEmail, in.ContactPhone,
		in.AddressLine1, in.AddressLine2, in.City, in.Region, in.Postcode, in.Country,
		in.Latitude, in.Longitude, in.ClearCoordinates,
		strSlice(in.Disciplines), strSlice(in.Distances), strSlice(in.Facilities),
		in.MembershipInfo, in.VisitorPolicy, in.EstablishedYear,
	); err != nil {
		return nil, fmt.Errorf("admin update club: %w", err)
	}

	club, err := r.GetByID(ctx, id, "")
	if err != nil {
		return nil, err
	}

	// Renaming re-derives the slug; the previous one stays in
	// share_slug_aliases so links already shared keep resolving.
	if club.Slug, err = syncShareSlug(ctx, r.db, SlugEntityClub, club.ID, club.Name, club.Slug); err != nil {
		return nil, err
	}
	return club, nil
}

// ListOpeningHours returns a club's published weekly session slots, ordered
// Monday-first and earliest-first within a day.
func (r *ClubRepository) ListOpeningHours(ctx context.Context, clubID string) ([]*model.ClubOpeningHours, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, club_id, day_of_week,
		       to_char(opens_at, 'HH24:MI'), to_char(closes_at, 'HH24:MI'),
		       is_closed, note
		FROM club_opening_hours
		WHERE club_id = $1
		ORDER BY day_of_week ASC, opens_at ASC NULLS FIRST
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("list club opening hours: %w", err)
	}
	defer rows.Close()

	var items []*model.ClubOpeningHours
	for rows.Next() {
		var h model.ClubOpeningHours
		if err := rows.Scan(&h.ID, &h.ClubID, &h.DayOfWeek, &h.OpensAt, &h.ClosesAt, &h.IsClosed, &h.Note); err != nil {
			return nil, fmt.Errorf("scan club opening hours: %w", err)
		}
		items = append(items, &h)
	}
	return items, rows.Err()
}

// ReplaceOpeningHours swaps a club's whole published week for the given slots
// in one transaction — the editor always submits the complete week, so a
// delete-then-insert keeps the stored week exactly what the admin saw.
func (r *ClubRepository) ReplaceOpeningHours(ctx context.Context, clubID string, slots []model.ClubOpeningHoursInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM club_opening_hours WHERE club_id = $1`, clubID); err != nil {
		return fmt.Errorf("clear club opening hours: %w", err)
	}

	for _, s := range slots {
		if _, err := tx.Exec(ctx, `
			INSERT INTO club_opening_hours (club_id, day_of_week, opens_at, closes_at, is_closed, note)
			VALUES ($1, $2, $3::time, $4::time, $5, NULLIF($6::text, ''))
		`, clubID, s.DayOfWeek, s.OpensAt, s.ClosesAt, s.IsClosed, s.Note); err != nil {
			return fmt.Errorf("insert club opening hours: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
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
