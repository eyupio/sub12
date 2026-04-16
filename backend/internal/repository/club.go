package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

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

	var club model.Club
	err = tx.QueryRow(ctx, `
		INSERT INTO clubs (name, description, created_by)
		VALUES ($1, $2, $3)
		RETURNING id, name, description, image_url, join_code, created_by,
		          created_at::text, updated_at::text
	`, input.Name, input.Description, userID).Scan(
		&club.ID, &club.Name, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert club: %w", err)
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
	var club model.Club
	if viewerID == "" {
		// Unauthenticated: skip member/admin subqueries to avoid invalid UUID cast
		err := r.db.QueryRow(ctx, `
			SELECT
				c.id, c.name, c.description, c.image_url, c.join_code, c.created_by,
				c.created_at::text, c.updated_at::text,
				(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count
			FROM clubs c
			WHERE c.id = $1
		`, clubID).Scan(
			&club.ID, &club.Name, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount,
		)
		if err != nil {
			return nil, fmt.Errorf("get club: %w", err)
		}
		return &club, nil
	}

	err := r.db.QueryRow(ctx, `
		SELECT
			c.id, c.name, c.description, c.image_url, c.join_code, c.created_by,
			c.created_at::text, c.updated_at::text,
			(SELECT COUNT(*) FROM club_members WHERE club_id = c.id)::int AS member_count,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $2::uuid), false) AS is_admin,
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $2::uuid) AS is_member
		FROM clubs c
		WHERE c.id = $1
	`, clubID, viewerID).Scan(
		&club.ID, &club.Name, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.MemberCount, &club.IsAdmin, &club.IsMember,
	)
	if err != nil {
		return nil, fmt.Errorf("get club: %w", err)
	}
	return &club, nil
}

func (r *ClubRepository) List(ctx context.Context, viewerID string) ([]*model.Club, error) {
	if viewerID == "" {
		rows, err := r.db.Query(ctx, `
			SELECT
				c.id, c.name, c.description, c.image_url, c.join_code, c.created_by,
				c.created_at::text, c.updated_at::text,
				COUNT(cm.user_id)::int AS member_count
			FROM clubs c
			LEFT JOIN club_members cm ON cm.club_id = c.id
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
				&club.ID, &club.Name, &club.Description, &club.ImageURL,
				&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
				&club.MemberCount,
			); err != nil {
				return nil, fmt.Errorf("scan club: %w", err)
			}
			clubs = append(clubs, &club)
		}
		return clubs, rows.Err()
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			c.id, c.name, c.description, c.image_url, c.join_code, c.created_by,
			c.created_at::text, c.updated_at::text,
			COUNT(cm.user_id)::int AS member_count,
			COALESCE((SELECT is_admin FROM club_members WHERE club_id = c.id AND user_id = $1::uuid), false) AS is_admin,
			EXISTS(SELECT 1 FROM club_members WHERE club_id = c.id AND user_id = $1::uuid) AS is_member
		FROM clubs c
		LEFT JOIN club_members cm ON cm.club_id = c.id
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
			&club.ID, &club.Name, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
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
			c.id, c.name, c.description, c.image_url, c.join_code, c.created_by,
			c.created_at::text, c.updated_at::text,
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
			&club.ID, &club.Name, &club.Description, &club.ImageURL,
			&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
			&club.MemberCount, &club.IsAdmin,
		); err != nil {
			return nil, fmt.Errorf("scan club: %w", err)
		}
		club.IsMember = true
		clubs = append(clubs, &club)
	}
	return clubs, rows.Err()
}

func (r *ClubRepository) Join(ctx context.Context, clubID, userID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO club_members (club_id, user_id, is_admin) VALUES ($1, $2, false)
	`, clubID, userID)
	if err != nil {
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

// AdminUpdate applies a partial update (name/description) to any club.
func (r *ClubRepository) AdminUpdate(ctx context.Context, id string, in *model.UpdateClubInput) (*model.Club, error) {
	var club model.Club
	err := r.db.QueryRow(ctx, `
		UPDATE clubs
		SET name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at  = NOW()
		WHERE id = $1
		RETURNING id, name, description, image_url, join_code, created_by,
		          created_at::text, updated_at::text,
		          (SELECT COUNT(*) FROM club_members WHERE club_id = $1)::int
	`, id, in.Name, in.Description).Scan(
		&club.ID, &club.Name, &club.Description, &club.ImageURL,
		&club.JoinCode, &club.CreatedBy, &club.CreatedAt, &club.UpdatedAt,
		&club.MemberCount,
	)
	if err != nil {
		return nil, fmt.Errorf("admin update club: %w", err)
	}
	return &club, nil
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
