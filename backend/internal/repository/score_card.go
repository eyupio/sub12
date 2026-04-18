package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type ScoreCardRepository struct {
	db *pgxpool.Pool
}

func NewScoreCardRepository(db *pgxpool.Pool) *ScoreCardRepository {
	return &ScoreCardRepository{db: db}
}

// Create inserts a new score card and returns it.
func (r *ScoreCardRepository) Create(ctx context.Context, userID string, input *model.CreateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	verification := "verified"
	if input.LeagueRoundID != nil {
		verification = "pending"
	}

	visibility := "public"
	if input.Visibility != nil && *input.Visibility == "private" {
		visibility = "private"
	}

	err := r.db.QueryRow(ctx, `
		INSERT INTO score_cards (
			user_id, rifle_id, pellet_id,
			shot_at, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			verification, league_round_id, club_id, visibility
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::verification_status,$14,$15,$16)
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, verification::text, visibility, league_round_id, club_id,
			like_count, comment_count,
			created_at, updated_at
	`,
		userID, input.RifleID, input.PelletID,
		input.ShotAt, input.Location, input.WindMPH, input.TempCelsius, input.Notes,
		pgtype.FlatArray[int16](input.ShotScores),
		pgtype.FlatArray[bool](input.ShotXs),
		totalScore, xCount,
		verification, input.LeagueRoundID, input.ClubID, visibility,
	).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID,
		&card.LikeCount, &card.CommentCount,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// GetByID retrieves a single score card, verifying it belongs to userID.
func (r *ScoreCardRepository) GetByID(ctx context.Context, id, userID string) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	err := r.db.QueryRow(ctx, `
		SELECT
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, verification::text, visibility, league_round_id, club_id,
			like_count, comment_count,
			EXISTS(SELECT 1 FROM likes WHERE target_id = score_cards.id AND target_type = 'score_card' AND user_id = $2) AS is_liked,
			created_at, updated_at
		FROM score_cards
		WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID,
		&card.LikeCount, &card.CommentCount, &card.IsLiked,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// GetPublicByID retrieves a score card by ID without an ownership check.
// Used when viewing another user's card (e.g. from comments or the activity feed).
func (r *ScoreCardRepository) GetPublicByID(ctx context.Context, id string) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	err := r.db.QueryRow(ctx, `
		SELECT
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, verification::text, visibility, league_round_id, club_id,
			like_count, comment_count,
			created_at, updated_at
		FROM score_cards
		WHERE id = $1
	`, id).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID,
		&card.LikeCount, &card.CommentCount,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get public score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// GetCardCount returns the total number of score cards for a user.
func (r *ScoreCardRepository) GetCardCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM score_cards WHERE user_id = $1`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("get card count: %w", err)
	}
	return count, nil
}

// IsPersonalBest returns true when the given card is the user's highest-scoring card.
// Ties with earlier cards count as a tie, not a new PB, so only a strictly higher
// score qualifies.
func (r *ScoreCardRepository) IsPersonalBest(ctx context.Context, userID, cardID string, totalScore int16) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM score_cards
			WHERE user_id = $1 AND id != $2 AND total_score >= $3
		)
	`, userID, cardID, totalScore).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check personal best: %w", err)
	}
	return !exists, nil
}

// ListByUser returns paginated score card summaries for a user, newest first.
// scope filters results: "personal" (no league), "league" (has league), or "" (all).
// leagueID optionally filters to cards belonging to a specific league.
func (r *ScoreCardRepository) ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error) {
	query := `
		SELECT sc.id, sc.shot_at::text, sc.total_score, sc.x_count, sc.location,
		       sc.verification::text, sc.league_round_id, l.id, l.name, sc.club_id, sc.created_at
		FROM score_cards sc
		LEFT JOIN rounds rd ON rd.id = sc.league_round_id
		LEFT JOIN seasons s ON s.id = rd.season_id
		LEFT JOIN leagues l ON l.id = s.league_id
		WHERE sc.user_id = $1
	`
	args := []any{userID}
	argIdx := 2

	switch scope {
	case "personal":
		query += ` AND sc.league_round_id IS NULL AND sc.club_id IS NULL`
	case "league":
		query += ` AND sc.league_round_id IS NOT NULL`
	case "club":
		query += ` AND sc.club_id IS NOT NULL`
	}

	if leagueID != "" {
		query += fmt.Sprintf(` AND l.id = $%d`, argIdx)
		args = append(args, leagueID)
		argIdx++
	}

	query += fmt.Sprintf(` ORDER BY sc.shot_at DESC, sc.created_at DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list score cards: %w", err)
	}
	defer rows.Close()

	var cards []*model.ScoreCardSummary
	for rows.Next() {
		var c model.ScoreCardSummary
		if err := rows.Scan(&c.ID, &c.ShotAt, &c.TotalScore, &c.XCount, &c.Location,
			&c.Verification, &c.LeagueRoundID, &c.LeagueID, &c.LeagueName, &c.ClubID, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan score card summary: %w", err)
		}
		cards = append(cards, &c)
	}
	return cards, rows.Err()
}

// Update modifies a score card's shots and metadata, resets verification to
// pending, and deletes any existing score confirmations — all in one transaction.
func (r *ScoreCardRepository) Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	err = tx.QueryRow(ctx, `
		UPDATE score_cards SET
			rifle_id    = $3,
			pellet_id   = $4,
			shot_at     = $5,
			location    = $6,
			wind_mph    = $7,
			temp_celsius = $8,
			notes       = $9,
			shot_scores = $10,
			shot_xs     = $11,
			total_score = $12,
			x_count     = $13,
			visibility  = COALESCE($14, visibility),
			verification = CASE WHEN league_round_id IS NULL THEN 'verified'::verification_status ELSE 'pending'::verification_status END,
			updated_at  = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, verification::text, visibility, league_round_id, club_id,
			like_count, comment_count,
			created_at, updated_at
	`,
		id, userID,
		input.RifleID, input.PelletID,
		input.ShotAt, input.Location, input.WindMPH, input.TempCelsius, input.Notes,
		pgtype.FlatArray[int16](input.ShotScores),
		pgtype.FlatArray[bool](input.ShotXs),
		totalScore, xCount, input.Visibility,
	).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID,
		&card.LikeCount, &card.CommentCount,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)

	// Clear all peer confirmations so the verification process restarts.
	_, err = tx.Exec(ctx, `DELETE FROM score_confirmations WHERE score_card_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("delete confirmations: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &card, nil
}

// UpdateImageURL sets the card_image_url for a score card.
func (r *ScoreCardRepository) UpdateImageURL(ctx context.Context, id, imageURL string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE score_cards SET card_image_url = $1, updated_at = NOW() WHERE id = $2`,
		imageURL, id,
	)
	if err != nil {
		return fmt.Errorf("update card image url: %w", err)
	}
	return nil
}
