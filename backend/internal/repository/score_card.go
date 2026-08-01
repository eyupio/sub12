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

// ErrSubmissionLimitExceeded is returned when a round's max_submissions_per_round
// cap is hit at the moment of insert/graduate, closing the race window between
// the caller's earlier count check and the write.
var ErrSubmissionLimitExceeded = errors.New("submission limit exceeded")

// Create inserts a new score card and returns it. When maxSubmissions > 0 and
// the card targets a league round, the count-check and insert are performed
// atomically under a Postgres advisory transaction lock keyed on (round, user)
// to prevent concurrent requests from both slipping past the cap.
func (r *ScoreCardRepository) Create(ctx context.Context, userID string, input *model.CreateScoreCardInput, totalScore, xCount int16, maxSubmissions int) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	verification := "verified"
	if input.LeagueRoundID != nil || input.EventParticipantID != nil {
		// League rounds and event submissions both default to 'pending'; the
		// service layer flips event cards to 'verified' when the event's
		// require_score_verification flag is off.
		verification = "pending"
	}

	visibility := "public"
	if input.Visibility != nil {
		switch *input.Visibility {
		case "private", "followers":
			visibility = *input.Visibility
		}
	}

	insertCols := `
			user_id, rifle_id, pellet_id,
			shot_at, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			verification, league_round_id, club_id, location_id, visibility, event_participant_id`
	returningCols := `
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at`

	args := []any{
		userID, input.RifleID, input.PelletID,
		input.ShotAt, input.Location, input.LocationLat, input.LocationLng, input.WindMPH, input.TempCelsius, input.DistanceM, input.Discipline, input.Notes,
		pgtype.FlatArray[int16](input.ShotScores),
		pgtype.FlatArray[bool](input.ShotXs),
		totalScore, xCount,
		verification, input.LeagueRoundID, input.ClubID, input.LocationID, visibility, input.EventParticipantID,
	}

	var query string
	gated := maxSubmissions > 0 && input.LeagueRoundID != nil && *input.LeagueRoundID != ""
	if gated {
		// Acquire a transaction-scoped advisory lock keyed on (round, user) before
		// counting existing submissions, so a concurrent request for the same
		// round/user can't read the same pre-insert count. hashtext takes text, so
		// the round and user placeholders go through ::uuid first — casting them
		// straight to text pins those parameters to text for the whole statement,
		// which breaks the uuid comparisons and the uuid target columns below.
		query = `
			WITH lock AS (
				SELECT pg_advisory_xact_lock(hashtext($18::uuid::text), hashtext($1::uuid::text))
			),
			cnt AS (
				SELECT count(*) AS n FROM score_cards, lock
				WHERE league_round_id = $18 AND user_id = $1 AND is_draft = false
			)
			INSERT INTO score_cards (` + insertCols + `)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::verification_status,$18,$19,$20,$21,$22
			FROM cnt WHERE cnt.n < $23
			RETURNING ` + returningCols
		args = append(args, maxSubmissions)
	} else {
		query = `INSERT INTO score_cards (` + insertCols + `)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::verification_status,$18,$19,$20,$21,$22)
			RETURNING ` + returningCols
	}

	err := r.db.QueryRow(ctx, query, args...).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if gated && errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSubmissionLimitExceeded
		}
		return nil, fmt.Errorf("create score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// CreateDraft inserts a quick-capture score card with minimal data. Shots
// default to empty arrays (they still satisfy the NOT NULL constraint),
// total_score/x_count default to 0, and is_draft=true keeps the row out of
// standings/stats until the user refines it.
func (r *ScoreCardRepository) CreateDraft(ctx context.Context, userID string, input *model.QuickCreateScoreCardInput) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	shotAt := ""
	if input.ShotAt != nil {
		shotAt = *input.ShotAt
	}

	visibility := "public"
	if input.Visibility != nil && (*input.Visibility == "private" || *input.Visibility == "followers") {
		visibility = *input.Visibility
	}

	empty16 := []int16{}
	emptyBool := []bool{}

	err := r.db.QueryRow(ctx, `
		INSERT INTO score_cards (
			user_id, rifle_id, pellet_id,
			shot_at, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			verification, league_round_id, club_id, location_id, visibility, is_draft, event_participant_id
		) VALUES ($1,$2,$3,COALESCE(NULLIF($4,'')::date, CURRENT_DATE),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,0,'pending'::verification_status,$15,$16,$17,$18,TRUE,$19)
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
	`,
		userID, input.RifleID, input.PelletID,
		shotAt, input.Location, input.LocationLat, input.LocationLng, input.WindMPH, input.TempCelsius, input.DistanceM, input.Discipline, input.Notes,
		pgtype.FlatArray[int16](empty16),
		pgtype.FlatArray[bool](emptyBool),
		input.LeagueRoundID, input.ClubID, input.LocationID, visibility, input.EventParticipantID,
	).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create score card draft: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// Graduate clears the is_draft flag in the same transaction used by the
// refine flow's final PATCH. Callers should first run Update to persist the
// full shot grid; Graduate only flips the flag and re-evaluates verification
// so league rounds move from pending to the appropriate state.
//
// When maxSubmissions > 0 and leagueRoundID is set, the peer-submission count
// and the update are performed atomically under a Postgres advisory
// transaction lock keyed on (round, user), closing the same TOCTOU race
// guarded against in Create.
func (r *ScoreCardRepository) Graduate(ctx context.Context, id, userID string, leagueRoundID *string, maxSubmissions int) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	returningCols := `
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at`
	setClause := `
			is_draft     = FALSE,
			verification = CASE
				WHEN league_round_id IS NOT NULL OR event_participant_id IS NOT NULL
					THEN 'pending'::verification_status
				ELSE 'verified'::verification_status
			END,
			updated_at   = NOW()`

	gated := maxSubmissions > 0 && leagueRoundID != nil && *leagueRoundID != ""
	var query string
	args := []any{id, userID}
	if gated {
		// Excludes this card itself; only peer submissions count toward the cap.
		query = `
			WITH lock AS (
				SELECT pg_advisory_xact_lock(hashtext($3::uuid::text), hashtext($2::uuid::text))
			),
			cnt AS (
				SELECT count(*) AS n FROM score_cards, lock
				WHERE league_round_id = $3 AND user_id = $2 AND is_draft = false AND id != $1
			)
			UPDATE score_cards SET` + setClause + `
			FROM cnt
			WHERE score_cards.id = $1 AND score_cards.user_id = $2 AND cnt.n < $4
			RETURNING ` + returningCols
		args = append(args, *leagueRoundID, maxSubmissions)
	} else {
		query = `UPDATE score_cards SET` + setClause + `
			WHERE id = $1 AND user_id = $2
			RETURNING ` + returningCols
	}

	err := r.db.QueryRow(ctx, query, args...).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if gated {
				return nil, ErrSubmissionLimitExceeded
			}
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("graduate score card: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// SetVerification overrides the verification status, used by the score-card
// service after Graduate when an event_participant_id is present and the event
// does not require peer verification.
func (r *ScoreCardRepository) SetVerification(ctx context.Context, id, verification string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE score_cards SET verification = $2::verification_status, updated_at = NOW() WHERE id = $1`,
		id, verification,
	)
	if err != nil {
		return fmt.Errorf("set verification: %w", err)
	}
	return nil
}

// GetExistingCardForParticipant returns the most recent (drafts last) score
// card linked to the given event participant, or ErrNotFound when none exists.
// Used to short-circuit a quick-create when a finalised card already exists.
func (r *ScoreCardRepository) GetExistingCardForParticipant(ctx context.Context, eventParticipantID string) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]
	err := r.db.QueryRow(ctx, `
		SELECT
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
		FROM score_cards
		WHERE event_participant_id = $1
		ORDER BY is_draft ASC, created_at DESC
		LIMIT 1
	`, eventParticipantID).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get existing card for participant: %w", err)
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
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			EXISTS(SELECT 1 FROM likes WHERE target_id = score_cards.id AND target_type = 'score_card' AND user_id = $2) AS is_liked,
			created_at, updated_at
		FROM score_cards
		WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID, &card.IsLiked,
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
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
		FROM score_cards
		WHERE id = $1
	`, id).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
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
// Drafts are excluded so "cards logged" counters reflect only completed entries.
func (r *ScoreCardRepository) GetCardCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM score_cards WHERE user_id = $1 AND is_draft = FALSE`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("get card count: %w", err)
	}
	return count, nil
}

// GetLeagueCardCount returns the number of score cards a user has submitted for league rounds.
func (r *ScoreCardRepository) GetLeagueCardCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM score_cards WHERE user_id = $1 AND league_round_id IS NOT NULL AND is_draft = FALSE`,
		userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("get league card count: %w", err)
	}
	return count, nil
}

// GetDraftCount returns the number of drafts the user has yet to refine.
// Used to badge the Drafts nav entry.
func (r *ScoreCardRepository) GetDraftCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM score_cards WHERE user_id = $1 AND is_draft = TRUE`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("get draft count: %w", err)
	}
	return count, nil
}

// PriorScoreStats summarizes a user's prior non-draft cards relative to a target card.
type PriorScoreStats struct {
	Count       int
	PreviousMax int16
	Mean        float64
}

// GetPriorScoreStats returns count, previous-best total_score, and mean
// total_score across the user's non-draft cards excluding the given card ID.
// Count is 0 when the user has no other non-draft cards; the other fields
// are then meaningless and callers should check Count first.
func (r *ScoreCardRepository) GetPriorScoreStats(ctx context.Context, userID, excludeID string) (*PriorScoreStats, error) {
	var stats PriorScoreStats
	var maxScore *int16
	var mean *float64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*), MAX(total_score), AVG(total_score)::float8
		FROM score_cards
		WHERE user_id = $1 AND id != $2 AND is_draft = FALSE
	`, userID, excludeID).Scan(&stats.Count, &maxScore, &mean)
	if err != nil {
		return nil, fmt.Errorf("get prior score stats: %w", err)
	}
	if maxScore != nil {
		stats.PreviousMax = *maxScore
	}
	if mean != nil {
		stats.Mean = *mean
	}
	return &stats, nil
}

// IsPersonalBest returns true when the given card is the user's highest-scoring card.
// Ties with earlier cards count as a tie, not a new PB, so only a strictly higher
// score qualifies. Drafts never qualify and don't block others from qualifying.
func (r *ScoreCardRepository) IsPersonalBest(ctx context.Context, userID, cardID string, totalScore int16) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM score_cards
			WHERE user_id = $1 AND id != $2 AND total_score >= $3 AND is_draft = FALSE
		)
	`, userID, cardID, totalScore).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check personal best: %w", err)
	}
	return !exists, nil
}

// ListByUser returns paginated score card summaries for a user, newest first.
// scope filters results: "personal" (no league), "league" (has league), "club",
// "drafts" (is_draft=true), or "" (all non-draft cards). Drafts are excluded
// from every other scope so they don't leak into list views.
// leagueID optionally filters to cards belonging to a specific league.
func (r *ScoreCardRepository) ListByUser(ctx context.Context, userID string, limit, offset int, scope string, leagueID string) ([]*model.ScoreCardSummary, error) {
	query := `
		SELECT sc.id, sc.shot_at::text, sc.total_score, sc.x_count, sc.location, sc.location_lat, sc.location_lng,
		       sc.verification::text, sc.league_round_id, l.id, l.name, sc.club_id,
		       sc.card_image_url, sc.is_draft, sc.event_participant_id, sc.created_at
		FROM score_cards sc
		LEFT JOIN rounds rd ON rd.id = sc.league_round_id
		LEFT JOIN seasons s ON s.id = rd.season_id
		LEFT JOIN leagues l ON l.id = s.league_id
		WHERE sc.user_id = $1
	`
	args := []any{userID}
	argIdx := 2

	switch scope {
	case "drafts":
		query += ` AND sc.is_draft = TRUE`
	case "personal":
		query += ` AND sc.is_draft = FALSE AND sc.league_round_id IS NULL AND sc.club_id IS NULL`
	case "league":
		query += ` AND sc.is_draft = FALSE AND sc.league_round_id IS NOT NULL`
	case "club":
		query += ` AND sc.is_draft = FALSE AND sc.club_id IS NOT NULL AND sc.league_round_id IS NULL`
	default:
		query += ` AND sc.is_draft = FALSE`
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
		if err := rows.Scan(&c.ID, &c.ShotAt, &c.TotalScore, &c.XCount, &c.Location, &c.LocationLat, &c.LocationLng,
			&c.Verification, &c.LeagueRoundID, &c.LeagueID, &c.LeagueName, &c.ClubID,
			&c.CardImageURL, &c.IsDraft, &c.EventParticipantID, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan score card summary: %w", err)
		}
		cards = append(cards, &c)
	}
	return cards, rows.Err()
}

// Update modifies a score card's shots and metadata, resets verification to
// pending, and deletes any existing score confirmations — all in one transaction.
//
// input.LeagueRoundID follows the "omit to keep, empty string to clear"
// convention: clearing it detaches the card from its league round, and the
// verification reset below has to read the *new* link rather than the row's
// current one, or a card on its way out of a league would be left pending
// forever with nothing able to verify it.
func (r *ScoreCardRepository) Update(ctx context.Context, id, userID string, input *model.UpdateScoreCardInput, totalScore, xCount int16) (*model.ScoreCard, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	// $21 carries the request's intent (NULL = keep, '' = detach) and $22 the
	// round to move to, kept in a separate parameter so the uuid cast is never
	// applied to the empty string.
	const newRoundExpr = `CASE
			WHEN $21::text IS NULL THEN score_cards.league_round_id
			WHEN $21::text = ''    THEN NULL
			ELSE $22::uuid
		END`
	var newRound *string
	if input.LeagueRoundID != nil && *input.LeagueRoundID != "" {
		newRound = input.LeagueRoundID
	}

	err = tx.QueryRow(ctx, `
		UPDATE score_cards SET
			rifle_id     = $3,
			pellet_id    = $4,
			shot_at      = $5,
			location     = $6,
			location_lat = $7,
			location_lng = $8,
			wind_mph     = $9,
			temp_celsius = $10,
			distance_m   = $11,
			discipline   = $12,
			notes        = $13,
			shot_scores  = $14,
			shot_xs      = $15,
			total_score  = $16,
			x_count      = $17,
			visibility   = COALESCE($18, visibility),
			location_id  = $19,
			card_image_rotation = COALESCE($20, card_image_rotation),
			league_round_id = `+newRoundExpr+`,
			verification = CASE
				WHEN `+newRoundExpr+` IS NOT NULL OR event_participant_id IS NOT NULL
					THEN 'pending'::verification_status
				ELSE 'verified'::verification_status
			END,
			updated_at   = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
	`,
		id, userID,
		input.RifleID, input.PelletID,
		input.ShotAt, input.Location, input.LocationLat, input.LocationLng, input.WindMPH, input.TempCelsius, input.DistanceM, input.Discipline, input.Notes,
		pgtype.FlatArray[int16](input.ShotScores),
		pgtype.FlatArray[bool](input.ShotXs),
		totalScore, xCount, input.Visibility, input.LocationID, input.CardImageRotation,
		input.LeagueRoundID, newRound,
	).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
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

// Delete removes a score card owned by the given user. FK cascades take care
// of score_confirmations and score_card_actions; polymorphic rows in likes,
// comments, and activities are cleaned up explicitly in the same transaction.
func (r *ScoreCardRepository) Delete(ctx context.Context, id, userID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`DELETE FROM score_cards WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("delete score card: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM likes WHERE target_id = $1 AND target_type = 'score_card'`, id,
	); err != nil {
		return fmt.Errorf("delete score card likes: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM comments WHERE target_id = $1 AND target_type = 'score_card'`, id,
	); err != nil {
		return fmt.Errorf("delete score card comments: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM activities WHERE target_id = $1 AND target_type = 'score_card'`, id,
	); err != nil {
		return fmt.Errorf("delete score card activities: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// UpdateImageURL sets the card_image_url for a score card owned by userID.
func (r *ScoreCardRepository) UpdateImageURL(ctx context.Context, id, userID, imageURL string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE score_cards SET card_image_url = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
		imageURL, id, userID,
	)
	if err != nil {
		return fmt.Errorf("update card image url: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateImageRotation sets card_image_rotation without touching any other
// field. Rotation is a cosmetic display setting, so this path deliberately
// does not reset verification or clear peer confirmations.
func (r *ScoreCardRepository) UpdateImageRotation(ctx context.Context, id, userID string, rotation int16) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	err := r.db.QueryRow(ctx, `
		UPDATE score_cards SET
			card_image_rotation = $3,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
	`, id, userID, rotation).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update card image rotation: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)
	return &card, nil
}

// GetGearLabels returns "make model" for the rifle and "brand model" for the
// pellet referenced by the given card. Empty strings come back when the IDs
// are unset, deleted, or otherwise unresolvable so feed callers can fall back
// to the "not set" UI without treating that as an error.
func (r *ScoreCardRepository) GetGearLabels(ctx context.Context, cardID string) (string, string, error) {
	var rifleName, pelletName *string
	err := r.db.QueryRow(ctx, `
		SELECT
			CASE WHEN ri.id IS NOT NULL THEN ri.make || ' ' || ri.model END AS rifle_name,
			CASE WHEN p.id  IS NOT NULL THEN p.brand  || ' ' || p.model  END AS pellet_name
		FROM score_cards sc
		LEFT JOIN rifles  ri ON ri.id = sc.rifle_id
		LEFT JOIN pellets p  ON p.id  = sc.pellet_id
		WHERE sc.id = $1
	`, cardID).Scan(&rifleName, &pelletName)
	if err != nil {
		return "", "", fmt.Errorf("get gear labels: %w", err)
	}
	rn, pn := "", ""
	if rifleName != nil {
		rn = *rifleName
	}
	if pelletName != nil {
		pn = *pelletName
	}
	return rn, pn, nil
}

// SubmitToLeague links a graduated (non-draft) score card to a league round
// and sets verification to pending. Only updates rows that have no existing
// league_round_id, so double-submission is a no-op (0 rows affected → ErrNotFound).
// Any confirmations or community review request gathered while the card was a
// personal practice card are cleared in the same transaction — league
// verification must start from zero.
func (r *ScoreCardRepository) SubmitToLeague(ctx context.Context, cardID, userID, roundID string) (*model.ScoreCard, error) {
	var card model.ScoreCard
	var shotScores pgtype.FlatArray[int16]
	var shotXs pgtype.FlatArray[bool]

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	err = tx.QueryRow(ctx, `
		UPDATE score_cards SET
			league_round_id = $3,
			verification    = 'pending'::verification_status,
			updated_at      = NOW()
		WHERE id = $1 AND user_id = $2 AND is_draft = FALSE AND league_round_id IS NULL AND event_participant_id IS NULL
		RETURNING
			id, user_id, rifle_id, pellet_id,
			shot_at::text, location, location_lat, location_lng, wind_mph, temp_celsius, distance_m, discipline, notes,
			shot_scores, shot_xs, total_score, x_count,
			card_image_url, card_image_rotation, verification::text, visibility, league_round_id, club_id, location_id,
			like_count, comment_count, is_draft, event_participant_id,
			created_at, updated_at
	`, cardID, userID, roundID).Scan(
		&card.ID, &card.UserID, &card.RifleID, &card.PelletID,
		&card.ShotAt, &card.Location, &card.LocationLat, &card.LocationLng, &card.WindMPH, &card.TempCelsius, &card.DistanceM, &card.Discipline, &card.Notes,
		&shotScores, &shotXs, &card.TotalScore, &card.XCount,
		&card.CardImageURL, &card.CardImageRotation, &card.Verification, &card.Visibility, &card.LeagueRoundID, &card.ClubID, &card.LocationID,
		&card.LikeCount, &card.CommentCount, &card.IsDraft, &card.EventParticipantID,
		&card.CreatedAt, &card.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("submit score card to league: %w", err)
	}
	card.ShotScores = []int16(shotScores)
	card.ShotXs = []bool(shotXs)

	if _, err := tx.Exec(ctx, `DELETE FROM score_confirmations WHERE score_card_id = $1`, cardID); err != nil {
		return nil, fmt.Errorf("clear confirmations on league submit: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM community_review_requests WHERE score_card_id = $1`, cardID); err != nil {
		return nil, fmt.Errorf("clear community review request on league submit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return &card, nil
}
