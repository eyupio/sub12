package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type SimulationRepository struct {
	db *pgxpool.Pool
}

func NewSimulationRepository(db *pgxpool.Pool) *SimulationRepository {
	return &SimulationRepository{db: db}
}

func scanSimulationSettings(row pgx.Row) (*model.SimulationSettings, error) {
	var s model.SimulationSettings
	if err := row.Scan(
		&s.ID,
		&s.Enabled,
		&s.PersonaCount,
		&s.ActionsPerHour,
		&s.PostWeight,
		&s.LikeWeight,
		&s.CommentWeight,
		&s.FollowWeight,
		&s.ActiveStartHour,
		&s.ActiveEndHour,
		&s.InteractWithRealUsers,
		&s.MaxCardsPerPersona,
		&s.LastRunAt,
		&s.LastAction,
		&s.UpdatedBy,
		&s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

const simulationSettingsColumns = `
	id, enabled, persona_count, actions_per_hour,
	post_weight, like_weight, comment_weight, follow_weight,
	active_start_hour, active_end_hour, interact_with_real_users,
	max_cards_per_persona, last_run_at, last_action, updated_by::text, updated_at
`

func (r *SimulationRepository) GetSettings(ctx context.Context) (*model.SimulationSettings, error) {
	s, err := scanSimulationSettings(r.db.QueryRow(ctx, `
		SELECT `+simulationSettingsColumns+`
		FROM simulation_settings
		WHERE id = 1
	`))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get simulation settings: %w", err)
	}
	return s, nil
}

func (r *SimulationRepository) UpsertSettings(ctx context.Context, input *model.UpsertSimulationSettingsInput, updatedBy string) (*model.SimulationSettings, error) {
	s, err := scanSimulationSettings(r.db.QueryRow(ctx, `
		INSERT INTO simulation_settings (
			id, enabled, persona_count, actions_per_hour,
			post_weight, like_weight, comment_weight, follow_weight,
			active_start_hour, active_end_hour, interact_with_real_users,
			max_cards_per_persona, updated_by, updated_at
		)
		VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid, NOW())
		ON CONFLICT (id) DO UPDATE
		SET
			enabled = EXCLUDED.enabled,
			persona_count = EXCLUDED.persona_count,
			actions_per_hour = EXCLUDED.actions_per_hour,
			post_weight = EXCLUDED.post_weight,
			like_weight = EXCLUDED.like_weight,
			comment_weight = EXCLUDED.comment_weight,
			follow_weight = EXCLUDED.follow_weight,
			active_start_hour = EXCLUDED.active_start_hour,
			active_end_hour = EXCLUDED.active_end_hour,
			interact_with_real_users = EXCLUDED.interact_with_real_users,
			max_cards_per_persona = EXCLUDED.max_cards_per_persona,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()
		RETURNING `+simulationSettingsColumns+`
	`, input.Enabled, input.PersonaCount, input.ActionsPerHour,
		input.PostWeight, input.LikeWeight, input.CommentWeight, input.FollowWeight,
		input.ActiveStartHour, input.ActiveEndHour, input.InteractWithRealUsers,
		input.MaxCardsPerPersona, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("upsert simulation settings: %w", err)
	}
	return s, nil
}

// TouchRun records the latest engine activity for status reporting.
func (r *SimulationRepository) TouchRun(ctx context.Context, lastAction string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE simulation_settings
		SET last_run_at = NOW(), last_action = $1
		WHERE id = 1
	`, lastAction)
	if err != nil {
		return fmt.Errorf("touch simulation run: %w", err)
	}
	return nil
}

// CreateSimulatedUser inserts a flagged simulated account. Returns the new id,
// or ErrConflict if the generated email collides with an existing row.
func (r *SimulationRepository) CreateSimulatedUser(ctx context.Context, email, displayName string, bio, location *string, passwordHash string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (email, display_name, password_hash, bio, location, is_simulated)
		VALUES ($1, $2, $3, $4, $5, TRUE)
		RETURNING id
	`, email, displayName, passwordHash, bio, location).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			return "", ErrConflict
		}
		return "", fmt.Errorf("create simulated user: %w", err)
	}
	return id, nil
}

func (r *SimulationRepository) CountSimulatedUsers(ctx context.Context) (int, error) {
	var n int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE is_simulated`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count simulated users: %w", err)
	}
	return n, nil
}

func (r *SimulationRepository) CountSimulatedCards(ctx context.Context) (int, error) {
	var n int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM score_cards sc
		JOIN users u ON u.id = sc.user_id
		WHERE u.is_simulated
	`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count simulated cards: %w", err)
	}
	return n, nil
}

// ListSimulatedUserIDs returns up to limit simulated account ids.
func (r *SimulationRepository) ListSimulatedUserIDs(ctx context.Context, limit int) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text FROM users WHERE is_simulated ORDER BY created_at LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list simulated users: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan simulated user id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CountCardsForUser returns how many non-draft score cards a user owns.
func (r *SimulationRepository) CountCardsForUser(ctx context.Context, userID string) (int, error) {
	var n int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM score_cards WHERE user_id = $1 AND is_draft = FALSE
	`, userID).Scan(&n); err != nil {
		return 0, fmt.Errorf("count cards for user: %w", err)
	}
	return n, nil
}

// RandomPublicCard picks a random public, non-draft score card not owned by
// excludeUserID. When simulatedOnly is true, only cards owned by simulated
// accounts are eligible (keeps simulated interaction off real users' content).
// Returns (cardID, ownerID). ErrNotFound when no eligible card exists.
func (r *SimulationRepository) RandomPublicCard(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, string, error) {
	query := `
		SELECT sc.id::text, sc.user_id::text
		FROM score_cards sc
		JOIN users u ON u.id = sc.user_id
		WHERE sc.visibility = 'public'
		  AND sc.is_draft = FALSE
		  AND sc.user_id <> $1`
	if simulatedOnly {
		query += ` AND u.is_simulated`
	}
	query += ` ORDER BY random() LIMIT 1`

	var cardID, ownerID string
	if err := r.db.QueryRow(ctx, query, excludeUserID).Scan(&cardID, &ownerID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", ErrNotFound
		}
		return "", "", fmt.Errorf("random public card: %w", err)
	}
	return cardID, ownerID, nil
}

// RandomFollowTarget picks a random user (with a public profile) that
// excludeUserID is not already following. When simulatedOnly is true, only
// simulated accounts are eligible. ErrNotFound when no eligible user exists.
func (r *SimulationRepository) RandomFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	query := `
		SELECT u.id::text
		FROM users u
		WHERE u.id <> $1
		  AND u.profile_visibility = 'public'
		  AND NOT EXISTS (
		      SELECT 1 FROM user_follows f
		      WHERE f.follower_id = $1 AND f.following_id = u.id
		  )`
	if simulatedOnly {
		query += ` AND u.is_simulated`
	}
	query += ` ORDER BY random() LIMIT 1`

	var id string
	if err := r.db.QueryRow(ctx, query, excludeUserID).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("random follow target: %w", err)
	}
	return id, nil
}
