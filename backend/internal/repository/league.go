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

var ErrAlreadyMember = errors.New("already a member")

type LeagueRepository struct {
	db *pgxpool.Pool
}

func NewLeagueRepository(db *pgxpool.Pool) *LeagueRepository {
	return &LeagueRepository{db: db}
}

// Create inserts a new public league and adds the creator as admin member.
func (r *LeagueRepository) Create(ctx context.Context, userID string, input *model.CreateLeagueInput) (*model.League, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var league model.League
	err = tx.QueryRow(ctx, `
		INSERT INTO leagues (name, description, type, created_by)
		VALUES ($1, $2, 'public', $3)
		RETURNING id, name, description, type::text, created_by, created_at
	`, input.Name, input.Description, userID).Scan(
		&league.ID, &league.Name, &league.Description,
		&league.Type, &league.CreatedBy, &league.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert league: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO league_members (league_id, user_id, is_admin) VALUES ($1, $2, true)
	`, league.ID, userID)
	if err != nil {
		return nil, fmt.Errorf("insert creator as member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	league.MemberCount = 1
	return &league, nil
}

// ListPublic returns all public leagues with their member counts.
func (r *LeagueRepository) ListPublic(ctx context.Context) ([]*model.League, error) {
	rows, err := r.db.Query(ctx, `
		SELECT l.id, l.name, l.description, l.type::text, l.created_by, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		WHERE l.type = 'public'
		GROUP BY l.id
		ORDER BY l.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list public leagues: %w", err)
	}
	defer rows.Close()

	var leagues []*model.League
	for rows.Next() {
		var l model.League
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.CreatedBy, &l.CreatedAt, &l.MemberCount); err != nil {
			return nil, fmt.Errorf("scan league: %w", err)
		}
		leagues = append(leagues, &l)
	}
	return leagues, rows.Err()
}

// GetByID returns a single league with member count.
func (r *LeagueRepository) GetByID(ctx context.Context, id string) (*model.League, error) {
	var l model.League
	err := r.db.QueryRow(ctx, `
		SELECT l.id, l.name, l.description, l.type::text, l.created_by, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		WHERE l.id = $1
		GROUP BY l.id
	`, id).Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.CreatedBy, &l.CreatedAt, &l.MemberCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get league: %w", err)
	}
	return &l, nil
}

// Join adds a user to a league. Returns ErrNotFound if the league doesn't exist,
// ErrAlreadyMember if the user is already in it.
func (r *LeagueRepository) Join(ctx context.Context, leagueID, userID string) error {
	// Verify league exists
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM leagues WHERE id = $1)`, leagueID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check league exists: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO league_members (league_id, user_id, is_admin) VALUES ($1, $2, false)
	`, leagueID, userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrAlreadyMember
		}
		return fmt.Errorf("join league: %w", err)
	}
	return nil
}

// Standings returns members of a league ranked by their best score.
func (r *LeagueRepository) Standings(ctx context.Context, leagueID string) ([]*model.LeagueStanding, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id,
			u.display_name,
			MAX(sc.total_score) AS best_score,
			(
				SELECT sc2.x_count
				FROM score_cards sc2
				WHERE sc2.user_id = u.id
				ORDER BY sc2.total_score DESC, sc2.x_count DESC
				LIMIT 1
			) AS best_x,
			COUNT(sc.id) AS card_count,
			lm.joined_at
		FROM league_members lm
		JOIN users u ON u.id = lm.user_id
		LEFT JOIN score_cards sc ON sc.user_id = lm.user_id
		WHERE lm.league_id = $1
		GROUP BY u.id, u.display_name, lm.joined_at
		ORDER BY MAX(sc.total_score) DESC NULLS LAST, lm.joined_at ASC
	`, leagueID)
	if err != nil {
		return nil, fmt.Errorf("get standings: %w", err)
	}
	defer rows.Close()

	var standings []*model.LeagueStanding
	rank := 1
	for rows.Next() {
		var s model.LeagueStanding
		if err := rows.Scan(&s.UserID, &s.DisplayName, &s.BestScore, &s.BestX, &s.CardCount, &s.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan standing: %w", err)
		}
		s.Rank = rank
		rank++
		standings = append(standings, &s)
	}
	return standings, rows.Err()
}

