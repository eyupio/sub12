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
		&s.TotalActions,
		&s.PostCount,
		&s.LikeCount,
		&s.CommentCount,
		&s.FollowCount,
		&s.LastError,
		&s.LastErrorAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

const simulationSettingsColumns = `
	id, enabled, persona_count, actions_per_hour,
	post_weight, like_weight, comment_weight, follow_weight,
	active_start_hour, active_end_hour, interact_with_real_users,
	max_cards_per_persona, last_run_at, last_action, updated_by::text, updated_at,
	total_actions, post_count, like_count, comment_count, follow_count,
	last_error, last_error_at
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

// IncrementCounts bumps the per-action counters, total_actions, and the
// last-run metadata in a single update. counts maps action labels ("post",
// "like", "comment", "follow") to how many of that action were performed. When
// lastErr is non-empty it is also recorded.
func (r *SimulationRepository) IncrementCounts(ctx context.Context, counts map[string]int, lastAction, lastErr string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE simulation_settings
		SET
			last_run_at  = NOW(),
			last_action  = $1,
			total_actions = total_actions + $2,
			post_count    = post_count + $3,
			like_count    = like_count + $4,
			comment_count = comment_count + $5,
			follow_count  = follow_count + $6,
			last_error    = NULLIF($7, ''),
			last_error_at = CASE WHEN $7 <> '' THEN NOW() ELSE last_error_at END
		WHERE id = 1
	`,
		lastAction,
		counts["post"]+counts["like"]+counts["comment"]+counts["follow"],
		counts["post"], counts["like"], counts["comment"], counts["follow"],
		lastErr,
	)
	if err != nil {
		return fmt.Errorf("increment simulation counts: %w", err)
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

// ListSimulatedUserIDs returns up to limit simulated account ids, oldest first.
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

// ListSimulatedPersonas returns a paginated list of simulated accounts with
// their non-draft score-card counts, plus the total count of simulated users.
func (r *SimulationRepository) ListSimulatedPersonas(ctx context.Context, limit, offset int) ([]*model.SimulatedPersona, int, error) {
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE is_simulated`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count simulated personas: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.display_name, u.email, u.bio, u.location, u.club, u.avatar_url,
		       COUNT(sc.*) FILTER (WHERE sc.is_draft = FALSE),
		       u.created_at
		FROM users u
		LEFT JOIN score_cards sc ON sc.user_id = u.id
		WHERE u.is_simulated
		GROUP BY u.id, u.display_name, u.email, u.bio, u.location, u.club, u.avatar_url, u.created_at
		ORDER BY u.created_at
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list simulated personas: %w", err)
	}
	defer rows.Close()

	var out []*model.SimulatedPersona
	for rows.Next() {
		var p model.SimulatedPersona
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.Email, &p.Bio, &p.Location, &p.Club, &p.AvatarURL, &p.CardCount, &p.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan simulated persona: %w", err)
		}
		out = append(out, &p)
	}
	return out, total, rows.Err()
}

// DeleteSimulatedUser removes a single simulated user by id. Returns
// ErrNotFound when the row is missing or is not a simulated account. All
// user-owned content is removed via ON DELETE CASCADE.
func (r *SimulationRepository) DeleteSimulatedUser(ctx context.Context, id string) error {
	ct, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1 AND is_simulated`, id)
	if err != nil {
		return fmt.Errorf("delete simulated user: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteAllSimulated removes every simulated user and (via cascade) all of
// their content. Returns the number of users deleted.
func (r *SimulationRepository) DeleteAllSimulated(ctx context.Context) (int, error) {
	ct, err := r.db.Exec(ctx, `DELETE FROM users WHERE is_simulated`)
	if err != nil {
		return 0, fmt.Errorf("delete all simulated users: %w", err)
	}
	return int(ct.RowsAffected()), nil
}

// TrimSimulatedTo deletes the newest excess simulated accounts so that at most
// target remain. Returns the number deleted. Newest accounts are removed first
// so the oldest-established personas (which have built up content) are kept.
func (r *SimulationRepository) TrimSimulatedTo(ctx context.Context, target int) (int, error) {
	ct, err := r.db.Exec(ctx, `
		DELETE FROM users
		WHERE id IN (
			SELECT id FROM users
			WHERE is_simulated
			ORDER BY created_at
			OFFSET $1
		)
	`, target)
	if err != nil {
		return 0, fmt.Errorf("trim simulated users: %w", err)
	}
	return int(ct.RowsAffected()), nil
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

// eligibleCardWhere returns the WHERE clause (excluding the owner filter) used
// by both the count and the select for RandomPublicCard.
func eligibleCardWhere(simulatedOnly bool) string {
	q := `sc.visibility = 'public' AND sc.is_draft = FALSE AND sc.user_id <> $1`
	if simulatedOnly {
		q += ` AND u.is_simulated`
	}
	return q
}

// RandomPublicCard picks a random public, non-draft score card not owned by
// excludeUserID. When simulatedOnly is true, only cards owned by simulated
// accounts are eligible (keeps simulated interaction off real users' content).
// Returns (cardID, ownerID). ErrNotFound when no eligible card exists.
//
// Selection uses count-then-random-offset so cost is O(2) queries rather than
// O(n) ORDER BY random() as the cards table grows.
func (r *SimulationRepository) RandomPublicCard(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, string, error) {
	var n int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM score_cards sc JOIN users u ON u.id = sc.user_id
		WHERE `+eligibleCardWhere(simulatedOnly)+`
	`, excludeUserID).Scan(&n); err != nil {
		return "", "", fmt.Errorf("count random public card: %w", err)
	}
	if n == 0 {
		return "", "", ErrNotFound
	}

	var cardID, ownerID string
	err := r.db.QueryRow(ctx, `
		SELECT sc.id::text, sc.user_id::text
		FROM score_cards sc JOIN users u ON u.id = sc.user_id
		WHERE `+eligibleCardWhere(simulatedOnly)+`
		OFFSET floor(random() * $2) LIMIT 1
	`, excludeUserID, n).Scan(&cardID, &ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", ErrNotFound
		}
		return "", "", fmt.Errorf("random public card: %w", err)
	}
	return cardID, ownerID, nil
}

// eligibleFollowWhere returns the WHERE clause for RandomFollowTarget.
func eligibleFollowWhere(simulatedOnly bool) string {
	q := `u.id <> $1 AND u.profile_visibility = 'public' AND NOT EXISTS (
		SELECT 1 FROM user_follows f
		WHERE f.follower_id = $1 AND f.following_id = u.id
	)`
	if simulatedOnly {
		q += ` AND u.is_simulated`
	}
	return q
}

// RandomFollowTarget picks a random user (with a public profile) that
// excludeUserID is not already following. When simulatedOnly is true, only
// simulated accounts are eligible. ErrNotFound when no eligible user exists.
func (r *SimulationRepository) RandomFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	var n int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM users u WHERE `+eligibleFollowWhere(simulatedOnly)+`
	`, excludeUserID).Scan(&n); err != nil {
		return "", fmt.Errorf("count random follow target: %w", err)
	}
	if n == 0 {
		return "", ErrNotFound
	}

	var id string
	err := r.db.QueryRow(ctx, `
		SELECT u.id::text FROM users u
		WHERE `+eligibleFollowWhere(simulatedOnly)+`
		OFFSET floor(random() * $2) LIMIT 1
	`, excludeUserID, n).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("random follow target: %w", err)
	}
	return id, nil
}

// RecordAudit appends an admin-operation entry to the simulation audit log.
func (r *SimulationRepository) RecordAudit(ctx context.Context, event, actorID string, detail string) error {
	var actorArg any
	if actorID != "" {
		actorArg = actorID
	}
	var detailArg any
	if detail != "" {
		detailArg = detail
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO simulation_audit (event, actor_id, detail)
		VALUES ($1, $2, $3)
	`, event, actorArg, detailArg)
	if err != nil {
		return fmt.Errorf("record simulation audit: %w", err)
	}
	return nil
}

// ListAudit returns the most recent audit entries, newest first.
func (r *SimulationRepository) ListAudit(ctx context.Context, limit, offset int) ([]*model.SimulationAudit, int, error) {
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM simulation_audit`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count simulation audit: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, event, actor_id::text, detail::text, created_at
		FROM simulation_audit
		ORDER BY created_at DESC, id DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list simulation audit: %w", err)
	}
	defer rows.Close()

	var out []*model.SimulationAudit
	for rows.Next() {
		var a model.SimulationAudit
		if err := rows.Scan(&a.ID, &a.Event, &a.ActorID, &a.Detail, &a.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan simulation audit: %w", err)
		}
		out = append(out, &a)
	}
	return out, total, rows.Err()
}

// scanAdminUser scans an admin-user row including the is_simulated flag.
func scanAdminUser(row pgx.Row) (*model.AdminUser, error) {
	var u model.AdminUser
	if err := row.Scan(
		&u.ID, &u.Email, &u.Role, &u.DisplayName,
		&u.Bio, &u.Location, &u.Club, &u.AvatarURL, &u.IsSimulated,
		&u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &u, nil
}

const adminUserColumns = `id, email, role, display_name, bio, location, club, avatar_url, is_simulated, created_at, updated_at`

// UpdateSimulatedProfile applies a partial update to a simulated account's
// profile fields (display_name, bio, location, club). Returns ErrNotFound when
// the target is missing or is not a simulated account.
func (r *SimulationRepository) UpdateSimulatedProfile(ctx context.Context, id string, in *model.UpdateSimulatedPersonaInput) (*model.AdminUser, error) {
	u, err := scanAdminUser(r.db.QueryRow(ctx, `
		UPDATE users
		SET
			display_name = COALESCE($2, display_name),
			bio          = COALESCE($3, bio),
			location     = COALESCE($4, location),
			club         = COALESCE($5, club),
			updated_at   = NOW()
		WHERE id = $1 AND is_simulated
		RETURNING `+adminUserColumns+`
	`, id, in.DisplayName, in.Bio, in.Location, in.Club))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update simulated profile: %w", err)
	}
	return u, nil
}

// UpdateSimulatedAvatarURL sets the avatar_url on a simulated account. Returns
// ErrNotFound when the target is missing or is not a simulated account.
func (r *SimulationRepository) UpdateSimulatedAvatarURL(ctx context.Context, id, avatarURL string) (*model.AdminUser, error) {
	u, err := scanAdminUser(r.db.QueryRow(ctx, `
		UPDATE users
		SET avatar_url = $2, updated_at = NOW()
		WHERE id = $1 AND is_simulated
		RETURNING `+adminUserColumns+`
	`, id, avatarURL))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update simulated avatar: %w", err)
	}
	return u, nil
}
