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

	err := r.db.QueryRow(ctx, `
		INSERT INTO score_cards (
			user_id, rifle_id, pellet_id,
			shot_at, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, wind_mph, temp_celsius, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, verification::text, league_round_id,
			created_at, updated_at
	`,
		userID, input.RifleID, input.PelletID,
		input.ShotAt, input.Location, input.WindMPH, input.TempCelsius, input.Notes,
		pgtype.FlatArray[int16](input.ShotScores),
		pgtype.FlatArray[bool](input.ShotXs),
		totalScore, xCount,
	).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.LeagueRoundID,
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
			card_image_url, verification::text, league_round_id,
			created_at, updated_at
		FROM score_cards
		WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.WindMPH, &card.TempCelsius, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.Verification, &card.LeagueRoundID,
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

// ListByUser returns paginated score card summaries for a user, newest first.
func (r *ScoreCardRepository) ListByUser(ctx context.Context, userID string, limit, offset int) ([]*model.ScoreCardSummary, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, shot_at::text, total_score, x_count, location, created_at
		FROM score_cards
		WHERE user_id = $1
		ORDER BY shot_at DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list score cards: %w", err)
	}
	defer rows.Close()

	var cards []*model.ScoreCardSummary
	for rows.Next() {
		var c model.ScoreCardSummary
		if err := rows.Scan(&c.ID, &c.ShotAt, &c.TotalScore, &c.XCount, &c.Location, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan score card summary: %w", err)
		}
		cards = append(cards, &c)
	}
	return cards, rows.Err()
}
