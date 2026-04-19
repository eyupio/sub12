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
		INSERT INTO leagues (name, description, type, created_by, club_id)
		VALUES ($1, $2, COALESCE(NULLIF($3, ''), 'public')::league_type, $4, $5)
		RETURNING id, name, description, type::text, post_visibility, image_url, club_id, created_by, date_format, time_format, timezone, created_at
	`, input.Name, input.Description, input.Type, userID, input.ClubID).Scan(
		&league.ID, &league.Name, &league.Description,
		&league.Type, &league.PostVisibility, &league.ImageURL, &league.ClubID, &league.CreatedBy,
		&league.DateFormat, &league.TimeFormat, &league.Timezone, &league.CreatedAt,
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

	_, err = tx.Exec(ctx, `
		INSERT INTO league_configs (league_id, scoring_rule, join_policy)
		VALUES ($1, COALESCE($2::scoring_rule, 'highest'), COALESCE($3::join_policy, 'open'))
	`, league.ID, input.ScoringRule, input.JoinPolicy)
	if err != nil {
		return nil, fmt.Errorf("insert league config: %w", err)
	}

	// Generate a join code when join_policy is invite_code or league type is private.
	needsCode := (input.JoinPolicy != nil && *input.JoinPolicy == "invite_code") ||
		(input.Type == "private" && (input.JoinPolicy == nil || *input.JoinPolicy != "open"))
	if needsCode {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			return nil, fmt.Errorf("generate join code: %w", err)
		}
		code := hex.EncodeToString(b)
		_, err = tx.Exec(ctx, `UPDATE leagues SET join_code = $2 WHERE id = $1`, league.ID, code)
		if err != nil {
			return nil, fmt.Errorf("set join code: %w", err)
		}
		league.JoinCode = &code
	}

	// Auto-create a default season and round so scores can be submitted immediately.
	var seasonID string
	err = tx.QueryRow(ctx, `
		INSERT INTO seasons (league_id, name, starts_on)
		VALUES ($1, 'General', CURRENT_DATE)
		RETURNING id
	`, league.ID).Scan(&seasonID)
	if err != nil {
		return nil, fmt.Errorf("insert default season: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO rounds (season_id, name)
		VALUES ($1, 'Submissions')
	`, seasonID)
	if err != nil {
		return nil, fmt.Errorf("insert default round: %w", err)
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
		SELECT l.id, l.name, l.description, l.type::text, l.post_visibility, l.image_url, l.club_id, l.created_by,
		       l.date_format, l.time_format, l.timezone, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		WHERE l.type = 'public' AND l.club_id IS NULL
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
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.ImageURL, &l.ClubID, &l.CreatedBy,
			&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount); err != nil {
			return nil, fmt.Errorf("scan league: %w", err)
		}
		leagues = append(leagues, &l)
	}
	return leagues, rows.Err()
}

// ListByUser returns leagues the given user is a member of, with member count and config dates.
func (r *LeagueRepository) ListByUser(ctx context.Context, userID string) ([]*model.MyLeagueSummary, error) {
	rows, err := r.db.Query(ctx, `
		SELECT l.id, l.name, l.description, l.image_url,
		       (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count,
		       lc.starts_on::text, lc.ends_on::text
		FROM leagues l
		JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = $1
		LEFT JOIN league_configs lc ON lc.league_id = l.id
		ORDER BY l.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list leagues by user: %w", err)
	}
	defer rows.Close()

	var leagues []*model.MyLeagueSummary
	for rows.Next() {
		var l model.MyLeagueSummary
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.ImageURL, &l.MemberCount, &l.StartsOn, &l.EndsOn); err != nil {
			return nil, fmt.Errorf("scan league summary: %w", err)
		}
		leagues = append(leagues, &l)
	}
	return leagues, rows.Err()
}

// GetByID returns a single league with member count.
func (r *LeagueRepository) GetByID(ctx context.Context, id string) (*model.League, error) {
	var l model.League
	err := r.db.QueryRow(ctx, `
		SELECT l.id, l.name, l.description, l.type::text, l.post_visibility, l.join_code, l.image_url, l.club_id, l.created_by,
		       l.date_format, l.time_format, l.timezone, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		WHERE l.id = $1
		GROUP BY l.id
	`, id).Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.JoinCode, &l.ImageURL, &l.ClubID, &l.CreatedBy,
		&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get league: %w", err)
	}
	return &l, nil
}

// UpdateImageURL sets the image_url for a league.
func (r *LeagueRepository) UpdateImageURL(ctx context.Context, leagueID, imageURL string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE leagues SET image_url = $2, updated_at = NOW() WHERE id = $1`,
		leagueID, imageURL,
	)
	if err != nil {
		return fmt.Errorf("update league image url: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListAll returns all leagues (public and private) with member counts for admin use.
func (r *LeagueRepository) ListAll(ctx context.Context) ([]*model.League, error) {
	rows, err := r.db.Query(ctx, `
		SELECT l.id, l.name, l.description, l.type::text, l.post_visibility, l.image_url, l.club_id, l.created_by,
		       l.date_format, l.time_format, l.timezone, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		GROUP BY l.id
		ORDER BY l.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list all leagues: %w", err)
	}
	defer rows.Close()

	var leagues []*model.League
	for rows.Next() {
		var l model.League
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.ImageURL, &l.ClubID, &l.CreatedBy,
			&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount); err != nil {
			return nil, fmt.Errorf("scan league: %w", err)
		}
		leagues = append(leagues, &l)
	}
	return leagues, rows.Err()
}

// AdminUpdate applies a partial update (name/description) to any league.
func (r *LeagueRepository) AdminUpdate(ctx context.Context, id string, in *model.UpdateLeagueInput) (*model.League, error) {
	var l model.League
	err := r.db.QueryRow(ctx, `
		UPDATE leagues
		SET name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at  = NOW()
		WHERE id = $1
		RETURNING id, name, description, type::text, post_visibility, image_url, club_id, created_by,
		          date_format, time_format, timezone, created_at,
		          (SELECT COUNT(*) FROM league_members WHERE league_id = $1)::int
	`, id, in.Name, in.Description).Scan(
		&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.ImageURL, &l.ClubID, &l.CreatedBy,
		&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("admin update league: %w", err)
	}
	return &l, nil
}

// UpdateBasics updates owner-editable league fields (name, description, type,
// post_visibility, and regional defaults) without a platform-admin check.
// Unset pointer fields are left unchanged.
func (r *LeagueRepository) UpdateBasics(ctx context.Context, id string, in *model.UpdateLeagueBasicsInput) (*model.League, error) {
	var l model.League
	err := r.db.QueryRow(ctx, `
		UPDATE leagues
		SET name            = COALESCE($2, name),
		    description     = COALESCE($3, description),
		    type            = COALESCE($4::league_type, type),
		    post_visibility = COALESCE($5, post_visibility),
		    date_format     = COALESCE($6, date_format),
		    time_format     = COALESCE($7, time_format),
		    timezone        = COALESCE($8, timezone),
		    updated_at      = NOW()
		WHERE id = $1
		RETURNING id, name, description, type::text, post_visibility, image_url, club_id, created_by,
		          date_format, time_format, timezone, created_at,
		          (SELECT COUNT(*) FROM league_members WHERE league_id = $1)::int
	`, id, in.Name, in.Description, in.Type, in.PostVisibility, in.DateFormat, in.TimeFormat, in.Timezone).Scan(
		&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.ImageURL, &l.ClubID, &l.CreatedBy,
		&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update league basics: %w", err)
	}
	return &l, nil
}

// AdminDelete removes a league by ID.
func (r *LeagueRepository) AdminDelete(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM leagues WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete league: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AdminRemoveMember removes a member from a league without checking admin status.
func (r *LeagueRepository) AdminRemoveMember(ctx context.Context, leagueID, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM league_members WHERE league_id = $1 AND user_id = $2`, leagueID, userID)
	return err
}

// ListByClub returns all leagues hosted by a given club.
func (r *LeagueRepository) ListByClub(ctx context.Context, clubID string) ([]*model.League, error) {
	rows, err := r.db.Query(ctx, `
		SELECT l.id, l.name, l.description, l.type::text, l.post_visibility, l.image_url, l.club_id, l.created_by,
		       l.date_format, l.time_format, l.timezone, l.created_at,
		       COUNT(lm.user_id) AS member_count
		FROM leagues l
		LEFT JOIN league_members lm ON lm.league_id = l.id
		WHERE l.club_id = $1
		GROUP BY l.id
		ORDER BY l.created_at DESC
	`, clubID)
	if err != nil {
		return nil, fmt.Errorf("list leagues by club: %w", err)
	}
	defer rows.Close()

	var leagues []*model.League
	for rows.Next() {
		var l model.League
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.Type, &l.PostVisibility, &l.ImageURL, &l.ClubID, &l.CreatedBy,
			&l.DateFormat, &l.TimeFormat, &l.Timezone, &l.CreatedAt, &l.MemberCount); err != nil {
			return nil, fmt.Errorf("scan league: %w", err)
		}
		leagues = append(leagues, &l)
	}
	return leagues, rows.Err()
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

// Standings returns members of a league ranked by their score.
// scoringRule is "highest" (MAX) or "average" (AVG).
func (r *LeagueRepository) Standings(ctx context.Context, leagueID string, scoringRule string) ([]*model.LeagueStanding, error) {
	agg := "MAX"
	if scoringRule == "average" {
		agg = "AVG"
	}

	query := fmt.Sprintf(`
		SELECT
			u.id,
			u.display_name,
			%s(sc.total_score::double precision) AS score,
			(
				SELECT sc2.x_count
				FROM score_cards sc2
				WHERE sc2.user_id = u.id AND sc2.verification = 'verified'
				ORDER BY sc2.total_score DESC, sc2.x_count DESC
				LIMIT 1
			) AS best_x,
			COUNT(sc.id) AS card_count,
			lm.joined_at
		FROM league_members lm
		JOIN users u ON u.id = lm.user_id
		LEFT JOIN score_cards sc ON sc.user_id = lm.user_id AND sc.verification = 'verified'
		WHERE lm.league_id = $1
		GROUP BY u.id, u.display_name, lm.joined_at
		ORDER BY %s(sc.total_score::double precision) DESC NULLS LAST, lm.joined_at ASC
	`, agg, agg)

	rows, err := r.db.Query(ctx, query, leagueID)
	if err != nil {
		return nil, fmt.Errorf("get standings: %w", err)
	}
	defer rows.Close()

	var standings []*model.LeagueStanding
	// Competition ranking: members with identical scores share a rank, and the
	// next distinct score skips over the tied positions (1, 1, 3, ...).
	var prevScore *float64
	currentRank := 0
	position := 0
	for rows.Next() {
		var s model.LeagueStanding
		if err := rows.Scan(&s.UserID, &s.DisplayName, &s.BestScore, &s.BestX, &s.CardCount, &s.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan standing: %w", err)
		}
		position++
		if currentRank == 0 || !sameScore(prevScore, s.BestScore) {
			currentRank = position
		}
		s.Rank = currentRank
		prevScore = s.BestScore
		standings = append(standings, &s)
	}
	return standings, rows.Err()
}

// sameScore returns true when two nullable scores represent the same value
// (both nil counts as equal so unscored members share a rank).
func sameScore(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

func (r *LeagueRepository) IsAdmin(ctx context.Context, leagueID, userID string) (bool, error) {
	var isAdmin bool
	err := r.db.QueryRow(ctx,
		`SELECT is_admin FROM league_members WHERE league_id = $1 AND user_id = $2`,
		leagueID, userID,
	).Scan(&isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check admin: %w", err)
	}
	return isAdmin, nil
}

func (r *LeagueRepository) IsMember(ctx context.Context, leagueID, userID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2)`,
		leagueID, userID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check member: %w", err)
	}
	return exists, nil
}

// ---------------------------------------------------------------------------
// League config
// ---------------------------------------------------------------------------

func (r *LeagueRepository) GetConfig(ctx context.Context, leagueID string) (*model.LeagueConfig, error) {
	var c model.LeagueConfig
	err := r.db.QueryRow(ctx, `
		SELECT league_id, starts_on::text, ends_on::text,
		       max_submissions_per_round, scoring_rule::text, join_policy::text,
		       require_score_verification, required_confirmations, require_image_upload,
		       lock_edits_after_verification, updated_at
		FROM league_configs WHERE league_id = $1
	`, leagueID).Scan(
		&c.LeagueID, &c.StartsOn, &c.EndsOn,
		&c.MaxSubmissionsPerRound, &c.ScoringRule, &c.JoinPolicy,
		&c.RequireScoreVerification, &c.RequiredConfirmations, &c.RequireImageUpload,
		&c.LockEditsAfterVerification, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get league config: %w", err)
	}
	return &c, nil
}

func (r *LeagueRepository) UpdateConfig(ctx context.Context, leagueID string, input *model.UpdateLeagueConfigInput) (*model.LeagueConfig, error) {
	var c model.LeagueConfig
	err := r.db.QueryRow(ctx, `
		UPDATE league_configs SET
			starts_on                     = COALESCE($2::date, starts_on),
			ends_on                       = COALESCE($3::date, ends_on),
			max_submissions_per_round     = COALESCE($4, max_submissions_per_round),
			scoring_rule                  = COALESCE($5::scoring_rule, scoring_rule),
			join_policy                   = COALESCE($6::join_policy, join_policy),
			require_score_verification    = COALESCE($7, require_score_verification),
			required_confirmations        = COALESCE($8, required_confirmations),
			require_image_upload          = COALESCE($9, require_image_upload),
			lock_edits_after_verification = COALESCE($10, lock_edits_after_verification),
			updated_at                    = NOW()
		WHERE league_id = $1
		RETURNING league_id, starts_on::text, ends_on::text,
		          max_submissions_per_round, scoring_rule::text, join_policy::text,
		          require_score_verification, required_confirmations, require_image_upload,
		          lock_edits_after_verification, updated_at
	`, leagueID,
		input.StartsOn, input.EndsOn, input.MaxSubmissionsPerRound,
		input.ScoringRule, input.JoinPolicy,
		input.RequireScoreVerification, input.RequiredConfirmations, input.RequireImageUpload,
		input.LockEditsAfterVerification,
	).Scan(
		&c.LeagueID, &c.StartsOn, &c.EndsOn,
		&c.MaxSubmissionsPerRound, &c.ScoringRule, &c.JoinPolicy,
		&c.RequireScoreVerification, &c.RequiredConfirmations, &c.RequireImageUpload,
		&c.LockEditsAfterVerification, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update league config: %w", err)
	}
	return &c, nil
}

// ---------------------------------------------------------------------------
// Seasons & Rounds
// ---------------------------------------------------------------------------

func (r *LeagueRepository) CreateSeason(ctx context.Context, leagueID string, input *model.CreateSeasonInput) (*model.Season, error) {
	var s model.Season
	err := r.db.QueryRow(ctx, `
		INSERT INTO seasons (league_id, name, starts_on, ends_on)
		VALUES ($1, $2, $3, $4)
		RETURNING id, league_id, name, starts_on::text, ends_on::text, is_active, created_at
	`, leagueID, input.Name, input.StartsOn, input.EndsOn).Scan(
		&s.ID, &s.LeagueID, &s.Name, &s.StartsOn, &s.EndsOn, &s.IsActive, &s.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create season: %w", err)
	}
	return &s, nil
}

func (r *LeagueRepository) ListSeasons(ctx context.Context, leagueID string) ([]*model.Season, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, league_id, name, starts_on::text, ends_on::text, is_active, created_at
		FROM seasons WHERE league_id = $1 ORDER BY starts_on DESC
	`, leagueID)
	if err != nil {
		return nil, fmt.Errorf("list seasons: %w", err)
	}
	defer rows.Close()

	var seasons []*model.Season
	for rows.Next() {
		var s model.Season
		if err := rows.Scan(&s.ID, &s.LeagueID, &s.Name, &s.StartsOn, &s.EndsOn, &s.IsActive, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan season: %w", err)
		}
		seasons = append(seasons, &s)
	}
	return seasons, rows.Err()
}

func (r *LeagueRepository) CreateRound(ctx context.Context, seasonID string, input *model.CreateRoundInput) (*model.Round, error) {
	var rd model.Round
	err := r.db.QueryRow(ctx, `
		INSERT INTO rounds (season_id, name, opens_at, closes_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, season_id, name, opens_at::text, closes_at::text, created_at
	`, seasonID, input.Name, input.OpensAt, input.ClosesAt).Scan(
		&rd.ID, &rd.SeasonID, &rd.Name, &rd.OpensAt, &rd.ClosesAt, &rd.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create round: %w", err)
	}
	return &rd, nil
}

func (r *LeagueRepository) ListRounds(ctx context.Context, seasonID string) ([]*model.Round, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, season_id, name, opens_at::text, closes_at::text, created_at
		FROM rounds WHERE season_id = $1 ORDER BY opens_at ASC NULLS LAST
	`, seasonID)
	if err != nil {
		return nil, fmt.Errorf("list rounds: %w", err)
	}
	defer rows.Close()

	var rounds []*model.Round
	for rows.Next() {
		var rd model.Round
		if err := rows.Scan(&rd.ID, &rd.SeasonID, &rd.Name, &rd.OpensAt, &rd.ClosesAt, &rd.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan round: %w", err)
		}
		rounds = append(rounds, &rd)
	}
	return rounds, rows.Err()
}

// GetOrCreateDefaultRound returns a round ID for this league, creating a
// default "General" season and "Submissions" round if none exist.
func (r *LeagueRepository) GetOrCreateDefaultRound(ctx context.Context, leagueID string) (string, error) {
	// Try to find an existing round for this league.
	var roundID string
	err := r.db.QueryRow(ctx, `
		SELECT rd.id
		FROM rounds rd
		JOIN seasons s ON s.id = rd.season_id
		WHERE s.league_id = $1
		ORDER BY rd.created_at ASC
		LIMIT 1
	`, leagueID).Scan(&roundID)
	if err == nil {
		return roundID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("find existing round: %w", err)
	}

	// No rounds exist — create default season + round in a transaction.
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var seasonID string
	err = tx.QueryRow(ctx, `
		INSERT INTO seasons (league_id, name, starts_on)
		VALUES ($1, 'General', CURRENT_DATE)
		RETURNING id
	`, leagueID).Scan(&seasonID)
	if err != nil {
		return "", fmt.Errorf("insert default season: %w", err)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO rounds (season_id, name)
		VALUES ($1, 'Submissions')
		RETURNING id
	`, seasonID).Scan(&roundID)
	if err != nil {
		return "", fmt.Errorf("insert default round: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}
	return roundID, nil
}

// ListScores returns score cards submitted to a league (linked via rounds),
// enriched with the submitter's display name. Newest first.
// When verification is non-empty, results are filtered by that status.
func (r *LeagueRepository) ListScores(ctx context.Context, leagueID string, limit, offset int, verification string) ([]*model.LeagueScore, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	query := `
		SELECT sc.id, sc.user_id, u.display_name,
		       sc.shot_at::text, sc.total_score, sc.x_count,
		       sc.verification::text, sc.created_at
		FROM score_cards sc
		JOIN rounds rd ON rd.id = sc.league_round_id
		JOIN seasons s  ON s.id  = rd.season_id
		JOIN users u    ON u.id  = sc.user_id
		WHERE s.league_id = $1`

	args := []any{leagueID}
	if verification != "" {
		args = append(args, verification)
		query += fmt.Sprintf(" AND sc.verification = $%d::verification_status", len(args))
	}

	query += `
		ORDER BY sc.shot_at DESC, sc.created_at DESC
		LIMIT $` + fmt.Sprintf("%d", len(args)+1) + ` OFFSET $` + fmt.Sprintf("%d", len(args)+2)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list league scores: %w", err)
	}
	defer rows.Close()

	var scores []*model.LeagueScore
	for rows.Next() {
		var s model.LeagueScore
		if err := rows.Scan(&s.ID, &s.UserID, &s.DisplayName,
			&s.ShotAt, &s.TotalScore, &s.XCount,
			&s.Verification, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan league score: %w", err)
		}
		scores = append(scores, &s)
	}
	return scores, rows.Err()
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

func (r *LeagueRepository) CreateJoinRequest(ctx context.Context, leagueID, userID string) (*model.JoinRequest, error) {
	var jr model.JoinRequest
	err := r.db.QueryRow(ctx, `
		INSERT INTO league_join_requests (league_id, user_id)
		VALUES ($1, $2)
		RETURNING id, league_id, user_id, status, decided_by, decided_at, created_at
	`, leagueID, userID).Scan(
		&jr.ID, &jr.LeagueID, &jr.UserID, &jr.Status, &jr.DecidedBy, &jr.DecidedAt, &jr.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create join request: %w", err)
	}
	return &jr, nil
}

func (r *LeagueRepository) ListJoinRequests(ctx context.Context, leagueID, status string) ([]*model.JoinRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT jr.id, jr.league_id, jr.user_id, u.display_name, jr.status, jr.decided_by, jr.decided_at, jr.created_at
		FROM league_join_requests jr
		JOIN users u ON u.id = jr.user_id
		WHERE jr.league_id = $1 AND ($2 = '' OR jr.status = $2)
		ORDER BY jr.created_at DESC
	`, leagueID, status)
	if err != nil {
		return nil, fmt.Errorf("list join requests: %w", err)
	}
	defer rows.Close()

	var requests []*model.JoinRequest
	for rows.Next() {
		var jr model.JoinRequest
		if err := rows.Scan(&jr.ID, &jr.LeagueID, &jr.UserID, &jr.DisplayName, &jr.Status, &jr.DecidedBy, &jr.DecidedAt, &jr.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan join request: %w", err)
		}
		requests = append(requests, &jr)
	}
	return requests, rows.Err()
}

func (r *LeagueRepository) DecideJoinRequest(ctx context.Context, leagueID, requestID, adminID, decision string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `
		UPDATE league_join_requests
		SET status = $2, decided_by = $3, decided_at = NOW()
		WHERE id = $1 AND league_id = $4 AND status = 'pending'
		RETURNING user_id
	`, requestID, decision, adminID, leagueID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("update join request: %w", err)
	}

	if decision == "approved" {
		_, err = tx.Exec(ctx, `
			INSERT INTO league_members (league_id, user_id, is_admin)
			VALUES ($1, $2, false)
			ON CONFLICT DO NOTHING
		`, leagueID, userID)
		if err != nil {
			return fmt.Errorf("insert member after approval: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *LeagueRepository) JoinWithCode(ctx context.Context, leagueID, userID, code string) error {
	var match bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM leagues WHERE id = $1 AND join_code = $2)`,
		leagueID, code,
	).Scan(&match)
	if err != nil {
		return fmt.Errorf("verify join code: %w", err)
	}
	if !match {
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
		return fmt.Errorf("join with code: %w", err)
	}
	return nil
}

func (r *LeagueRepository) RegenerateJoinCode(ctx context.Context, leagueID string) (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random code: %w", err)
	}
	code := hex.EncodeToString(b)

	_, err := r.db.Exec(ctx,
		`UPDATE leagues SET join_code = $2, updated_at = NOW() WHERE id = $1`,
		leagueID, code,
	)
	if err != nil {
		return "", fmt.Errorf("update join code: %w", err)
	}
	return code, nil
}

// ---------------------------------------------------------------------------
// Score confirmations & admin actions
// ---------------------------------------------------------------------------

func (r *LeagueRepository) ConfirmScore(ctx context.Context, scoreCardID, userID string) (*model.ScoreConfirmation, error) {
	var sc model.ScoreConfirmation
	err := r.db.QueryRow(ctx, `
		INSERT INTO score_confirmations (score_card_id, confirmed_by)
		VALUES ($1, $2)
		RETURNING id, score_card_id, confirmed_by, created_at
	`, scoreCardID, userID).Scan(&sc.ID, &sc.ScoreCardID, &sc.ConfirmedBy, &sc.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("confirm score: %w", err)
	}
	return &sc, nil
}

func (r *LeagueRepository) ListConfirmations(ctx context.Context, scoreCardID string) ([]*model.ScoreConfirmation, error) {
	rows, err := r.db.Query(ctx, `
		SELECT sc.id, sc.score_card_id, sc.confirmed_by, u.display_name, sc.created_at
		FROM score_confirmations sc
		JOIN users u ON u.id = sc.confirmed_by
		WHERE sc.score_card_id = $1
		ORDER BY sc.created_at ASC
	`, scoreCardID)
	if err != nil {
		return nil, fmt.Errorf("list confirmations: %w", err)
	}
	defer rows.Close()

	var confs []*model.ScoreConfirmation
	for rows.Next() {
		var c model.ScoreConfirmation
		if err := rows.Scan(&c.ID, &c.ScoreCardID, &c.ConfirmedBy, &c.DisplayName, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan confirmation: %w", err)
		}
		confs = append(confs, &c)
	}
	return confs, rows.Err()
}

func (r *LeagueRepository) GetConfirmationCount(ctx context.Context, scoreCardID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM score_confirmations WHERE score_card_id = $1`,
		scoreCardID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count confirmations: %w", err)
	}
	return count, nil
}

func (r *LeagueRepository) AmendScore(ctx context.Context, scoreCardID, adminID string, input *model.AmendScoreInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var oldTotal, oldX int16
	err = tx.QueryRow(ctx,
		`SELECT total_score, x_count FROM score_cards WHERE id = $1 FOR UPDATE`,
		scoreCardID,
	).Scan(&oldTotal, &oldX)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("read current score: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO score_card_actions (score_card_id, action, performed_by, reason, old_total_score, new_total_score, old_x_count, new_x_count)
		VALUES ($1, 'amend', $2, $3, $4, $5, $6, $7)
	`, scoreCardID, adminID, input.Reason, oldTotal, input.NewTotalScore, oldX, input.NewXCount)
	if err != nil {
		return fmt.Errorf("insert amend action: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE score_cards SET total_score = $2, x_count = $3, verification = 'verified', updated_at = NOW()
		WHERE id = $1
	`, scoreCardID, input.NewTotalScore, input.NewXCount)
	if err != nil {
		return fmt.Errorf("update score card: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *LeagueRepository) RejectScore(ctx context.Context, scoreCardID, adminID string, input *model.RejectScoreInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO score_card_actions (score_card_id, action, performed_by, reason)
		VALUES ($1, 'reject', $2, $3)
	`, scoreCardID, adminID, input.Reason)
	if err != nil {
		return fmt.Errorf("insert reject action: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE score_cards SET verification = 'rejected', updated_at = NOW() WHERE id = $1
	`, scoreCardID)
	if err != nil {
		return fmt.Errorf("update verification: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *LeagueRepository) ListScoreActions(ctx context.Context, scoreCardID string) ([]*model.ScoreCardAction, error) {
	rows, err := r.db.Query(ctx, `
		SELECT sa.id, sa.score_card_id, sa.action, sa.performed_by, u.display_name,
		       sa.reason, sa.old_total_score, sa.new_total_score, sa.old_x_count, sa.new_x_count, sa.created_at
		FROM score_card_actions sa
		JOIN users u ON u.id = sa.performed_by
		WHERE sa.score_card_id = $1
		ORDER BY sa.created_at ASC
	`, scoreCardID)
	if err != nil {
		return nil, fmt.Errorf("list score actions: %w", err)
	}
	defer rows.Close()

	var actions []*model.ScoreCardAction
	for rows.Next() {
		var a model.ScoreCardAction
		if err := rows.Scan(&a.ID, &a.ScoreCardID, &a.Action, &a.PerformedBy, &a.DisplayName,
			&a.Reason, &a.OldTotalScore, &a.NewTotalScore, &a.OldXCount, &a.NewXCount, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan score action: %w", err)
		}
		actions = append(actions, &a)
	}
	return actions, rows.Err()
}

func (r *LeagueRepository) UpdateScoreVerification(ctx context.Context, scoreCardID, status string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE score_cards SET verification = $2::verification_status, updated_at = NOW() WHERE id = $1`,
		scoreCardID, status,
	)
	if err != nil {
		return fmt.Errorf("update verification: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

func (r *LeagueRepository) ListMembers(ctx context.Context, leagueID string) ([]*model.LeagueMember, error) {
	rows, err := r.db.Query(ctx, `
		SELECT lm.user_id, u.display_name, lm.is_admin, lm.joined_at
		FROM league_members lm
		JOIN users u ON u.id = lm.user_id
		WHERE lm.league_id = $1
		ORDER BY lm.is_admin DESC, lm.joined_at ASC
	`, leagueID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []*model.LeagueMember
	for rows.Next() {
		var m model.LeagueMember
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.IsAdmin, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

// RemoveMember removes a non-admin member from a league.
// Returns ErrNotFound if the member does not exist or is an admin (admins cannot be removed this way).
func (r *LeagueRepository) RemoveMember(ctx context.Context, leagueID, memberID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM league_members WHERE league_id = $1 AND user_id = $2 AND is_admin = false`,
		leagueID, memberID,
	)
	if err != nil {
		return fmt.Errorf("remove member: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// LeaveLeague removes the caller's own membership row regardless of admin
// status. The last-admin guard is enforced in the service layer.
func (r *LeagueRepository) LeaveLeague(ctx context.Context, leagueID, userID string) error {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM league_members WHERE league_id = $1 AND user_id = $2`,
		leagueID, userID,
	)
	if err != nil {
		return fmt.Errorf("leave league: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountAdmins returns the number of admins in a league.
func (r *LeagueRepository) CountAdmins(ctx context.Context, leagueID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM league_members WHERE league_id = $1 AND is_admin = true`,
		leagueID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count league admins: %w", err)
	}
	return count, nil
}

// GetLeagueByScoreCardID resolves the league that a score card belongs to
// by traversing score_cards → rounds → seasons → leagues.
func (r *LeagueRepository) GetLeagueByScoreCardID(ctx context.Context, scoreCardID string) (*model.ScoreCardLeague, error) {
	var league model.ScoreCardLeague
	err := r.db.QueryRow(ctx, `
		SELECT l.id, l.name
		FROM leagues l
		JOIN seasons s  ON s.league_id = l.id
		JOIN rounds rd  ON rd.season_id = s.id
		JOIN score_cards sc ON sc.league_round_id = rd.id
		WHERE sc.id = $1
	`, scoreCardID).Scan(&league.ID, &league.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get league by score card: %w", err)
	}
	return &league, nil
}

// IsAdminForScoreCard checks whether the given user is an admin of the league
// that owns the given score card.
func (r *LeagueRepository) IsAdminForScoreCard(ctx context.Context, scoreCardID, userID string) (bool, string, error) {
	var leagueID string
	var isAdmin bool
	err := r.db.QueryRow(ctx, `
		SELECT l.id, COALESCE(lm.is_admin, false)
		FROM leagues l
		JOIN seasons s  ON s.league_id = l.id
		JOIN rounds rd  ON rd.season_id = s.id
		JOIN score_cards sc ON sc.league_round_id = rd.id
		LEFT JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = $2
		WHERE sc.id = $1
	`, scoreCardID, userID).Scan(&leagueID, &isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, "", ErrNotFound
	}
	if err != nil {
		return false, "", fmt.Errorf("check admin for score card: %w", err)
	}
	return isAdmin, leagueID, nil
}

// GetScoreCardOwner returns the user_id of a score card.
func (r *LeagueRepository) GetScoreCardOwner(ctx context.Context, scoreCardID string) (string, error) {
	var userID string
	err := r.db.QueryRow(ctx, `SELECT user_id FROM score_cards WHERE id = $1`, scoreCardID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("get score card owner: %w", err)
	}
	return userID, nil
}

// GetConfigByRoundID looks up the league config for the league that owns the given round.
func (r *LeagueRepository) GetConfigByRoundID(ctx context.Context, roundID string) (*model.LeagueConfig, error) {
	var c model.LeagueConfig
	err := r.db.QueryRow(ctx, `
		SELECT lc.league_id, lc.starts_on::text, lc.ends_on::text,
		       lc.max_submissions_per_round, lc.scoring_rule::text, lc.join_policy::text,
		       lc.require_score_verification, lc.required_confirmations,
		       lc.require_image_upload, lc.lock_edits_after_verification, lc.updated_at
		FROM league_configs lc
		JOIN seasons s ON s.league_id = lc.league_id
		JOIN rounds rd ON rd.season_id = s.id
		WHERE rd.id = $1
	`, roundID).Scan(
		&c.LeagueID, &c.StartsOn, &c.EndsOn,
		&c.MaxSubmissionsPerRound, &c.ScoringRule, &c.JoinPolicy,
		&c.RequireScoreVerification, &c.RequiredConfirmations,
		&c.RequireImageUpload, &c.LockEditsAfterVerification, &c.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get config by round: %w", err)
	}
	return &c, nil
}

// CountUserSubmissionsForRound returns the number of score cards a user has
// submitted to a specific round.
func (r *LeagueRepository) CountUserSubmissionsForRound(ctx context.Context, userID, roundID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM score_cards
		WHERE user_id = $1 AND league_round_id = $2
	`, userID, roundID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count user submissions for round: %w", err)
	}
	return count, nil
}

// GetLeagueIDByRoundID resolves a round ID to its parent league ID via rounds → seasons → leagues.
func (r *LeagueRepository) GetLeagueIDByRoundID(ctx context.Context, roundID string) (string, error) {
	var leagueID string
	err := r.db.QueryRow(ctx, `
		SELECT l.id
		FROM rounds r
		JOIN seasons s ON s.id = r.season_id
		JOIN leagues l ON l.id = s.league_id
		WHERE r.id = $1
	`, roundID).Scan(&leagueID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("get league id by round: %w", err)
	}
	return leagueID, nil
}

// ListAdminIDs returns the user IDs of all admins for a league.
func (r *LeagueRepository) ListAdminIDs(ctx context.Context, leagueID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT user_id FROM league_members WHERE league_id = $1 AND is_admin = TRUE
	`, leagueID)
	if err != nil {
		return nil, fmt.Errorf("list league admin ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan league admin id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetClubIDByLeagueID returns the club_id the league is hosted under, or nil.
func (r *LeagueRepository) GetClubIDByLeagueID(ctx context.Context, leagueID string) (*string, error) {
	var clubID *string
	err := r.db.QueryRow(ctx, `SELECT club_id FROM leagues WHERE id = $1`, leagueID).Scan(&clubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get club id by league: %w", err)
	}
	return clubID, nil
}

// GetScopeByScoreCardID returns the (league_id, club_id) scope for a score
// card. Either or both may be nil. A score card posted outside a league round
// and without an explicit club_id resolves to (nil, nil) — platform scope.
func (r *LeagueRepository) GetScopeByScoreCardID(ctx context.Context, scoreCardID string) (leagueID, clubID *string, err error) {
	err = r.db.QueryRow(ctx, `
		SELECT l.id, COALESCE(l.club_id, sc.club_id)
		FROM score_cards sc
		LEFT JOIN rounds rd  ON rd.id = sc.league_round_id
		LEFT JOIN seasons s  ON s.id  = rd.season_id
		LEFT JOIN leagues l  ON l.id  = s.league_id
		WHERE sc.id = $1
	`, scoreCardID).Scan(&leagueID, &clubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("get scope by score card: %w", err)
	}
	return leagueID, clubID, nil
}
