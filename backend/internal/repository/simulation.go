package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// simRecentWindow is how far back "fresh" content reaches for the purposes of
// picking something to like, comment on or share. Real users engage with what
// is on the feed in front of them, so the random pickers prefer this window and
// only widen to all-time when it turns up empty.
const simRecentWindow = "21 days"

type SimulationRepository struct {
	db *pgxpool.Pool
}

func NewSimulationRepository(db *pgxpool.Pool) *SimulationRepository {
	return &SimulationRepository{db: db}
}

func scanSimulationSettings(row pgx.Row) (*model.SimulationSettings, error) {
	var s model.SimulationSettings
	var hourlyRaw []byte
	if err := row.Scan(
		&s.ID,
		&s.Enabled,
		&s.PersonaCount,
		&s.ActionsPerHour,
		&s.PostWeight,
		&s.LikeWeight,
		&s.CommentWeight,
		&s.FollowWeight,
		&s.UnfollowWeight,
		&s.ShareWeight,
		&s.ActiveStartHour,
		&s.ActiveEndHour,
		&s.InteractWithRealUsers,
		&s.MaxCardsPerPersona,
		&hourlyRaw,
		&s.IncludeInPublicStats,
		&s.BackdateDays,
		&s.WeekendBias,
		&s.AwayDayChance,
		&s.ReplyChance,
		&s.SessionActions,
		&s.PersonaHistoryDays,
		&s.LastRunAt,
		&s.LastAction,
		&s.LastTickAt,
		&s.UpdatedBy,
		&s.UpdatedAt,
		&s.TotalActions,
		&s.PostCount,
		&s.LikeCount,
		&s.CommentCount,
		&s.FollowCount,
		&s.UnfollowCount,
		&s.ShareCount,
		&s.LastError,
		&s.LastErrorAt,
	); err != nil {
		return nil, err
	}
	if len(hourlyRaw) > 0 {
		var mults []float64
		if err := json.Unmarshal(hourlyRaw, &mults); err != nil {
			return nil, fmt.Errorf("decode hourly_multipliers: %w", err)
		}
		s.HourlyMultipliers = mults
	}
	return &s, nil
}

const simulationSettingsColumns = `
	id, enabled, persona_count, actions_per_hour,
	post_weight, like_weight, comment_weight, follow_weight,
	unfollow_weight, share_weight,
	active_start_hour, active_end_hour, interact_with_real_users,
	max_cards_per_persona, hourly_multipliers, include_in_public_stats,
	backdate_days, weekend_bias, away_day_chance, reply_chance,
	session_actions, persona_history_days,
	last_run_at, last_action, last_tick_at, updated_by::text, updated_at,
	total_actions, post_count, like_count, comment_count, follow_count,
	unfollow_count, share_count,
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
	mults := normalizeHourlyMultipliers(input.HourlyMultipliers)
	multsJSON, err := json.Marshal(mults)
	if err != nil {
		return nil, fmt.Errorf("encode hourly_multipliers: %w", err)
	}
	s, err := scanSimulationSettings(r.db.QueryRow(ctx, `
		INSERT INTO simulation_settings (
			id, enabled, persona_count, actions_per_hour,
			post_weight, like_weight, comment_weight, follow_weight,
			unfollow_weight, share_weight,
			active_start_hour, active_end_hour, interact_with_real_users,
			max_cards_per_persona, hourly_multipliers, include_in_public_stats,
			backdate_days, weekend_bias, away_day_chance, reply_chance,
			session_actions, persona_history_days,
			updated_by, updated_at
		)
		VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15,
		        $16, $17, $18, $19, $20, $21, $22::uuid, NOW())
		ON CONFLICT (id) DO UPDATE
		SET
			enabled = EXCLUDED.enabled,
			persona_count = EXCLUDED.persona_count,
			actions_per_hour = EXCLUDED.actions_per_hour,
			post_weight = EXCLUDED.post_weight,
			like_weight = EXCLUDED.like_weight,
			comment_weight = EXCLUDED.comment_weight,
			follow_weight = EXCLUDED.follow_weight,
			unfollow_weight = EXCLUDED.unfollow_weight,
			share_weight = EXCLUDED.share_weight,
			active_start_hour = EXCLUDED.active_start_hour,
			active_end_hour = EXCLUDED.active_end_hour,
			interact_with_real_users = EXCLUDED.interact_with_real_users,
			max_cards_per_persona = EXCLUDED.max_cards_per_persona,
			hourly_multipliers = EXCLUDED.hourly_multipliers,
			include_in_public_stats = EXCLUDED.include_in_public_stats,
			backdate_days = EXCLUDED.backdate_days,
			weekend_bias = EXCLUDED.weekend_bias,
			away_day_chance = EXCLUDED.away_day_chance,
			reply_chance = EXCLUDED.reply_chance,
			session_actions = EXCLUDED.session_actions,
			persona_history_days = EXCLUDED.persona_history_days,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()
		RETURNING `+simulationSettingsColumns+`
	`, input.Enabled, input.PersonaCount, input.ActionsPerHour,
		input.PostWeight, input.LikeWeight, input.CommentWeight, input.FollowWeight,
		input.UnfollowWeight, input.ShareWeight,
		input.ActiveStartHour, input.ActiveEndHour, input.InteractWithRealUsers,
		input.MaxCardsPerPersona, multsJSON, input.IncludeInPublicStats,
		input.BackdateDays, input.WeekendBias, input.AwayDayChance, input.ReplyChance,
		input.SessionActions, input.PersonaHistoryDays, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("upsert simulation settings: %w", err)
	}
	return s, nil
}

// normalizeHourlyMultipliers returns a 24-element slice of multipliers, padding
// or truncating the input and defaulting to all 1.0 when empty/invalid.
func normalizeHourlyMultipliers(in []float64) []float64 {
	const n = 24
	if len(in) == 0 {
		out := make([]float64, n)
		for i := range out {
			out[i] = 1.0
		}
		return out
	}
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		v := 1.0
		if i < len(in) {
			v = in[i]
		}
		if v < 0 {
			v = 0
		}
		out[i] = v
	}
	return out
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
// "like", "comment", "follow", "unfollow", "share") to how many of that action
// were performed. When lastErr is non-empty it is also recorded.
func (r *SimulationRepository) IncrementCounts(ctx context.Context, counts map[string]int, lastAction, lastErr string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE simulation_settings
		SET
			last_run_at   = NOW(),
			last_action   = $1,
			total_actions = total_actions + $2,
			post_count    = post_count + $3,
			like_count    = like_count + $4,
			comment_count = comment_count + $5,
			follow_count  = follow_count + $6,
			unfollow_count = unfollow_count + $7,
			share_count   = share_count + $8,
			last_error    = NULLIF($9, ''),
			last_error_at = CASE WHEN $9 <> '' THEN NOW() ELSE last_error_at END
		WHERE id = 1
	`,
		lastAction,
		counts["post"]+counts["like"]+counts["comment"]+counts["follow"]+counts["unfollow"]+counts["share"],
		counts["post"], counts["like"], counts["comment"], counts["follow"],
		counts["unfollow"], counts["share"],
		lastErr,
	)
	if err != nil {
		return fmt.Errorf("increment simulation counts: %w", err)
	}
	return nil
}

// TouchTick records that the background runner woke, so operators can tell a
// live-but-idle runner (disabled / outside active hours) from a stuck one.
func (r *SimulationRepository) TouchTick(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `UPDATE simulation_settings SET last_tick_at = NOW() WHERE id = 1`)
	if err != nil {
		return fmt.Errorf("touch simulation tick: %w", err)
	}
	return nil
}

// randomRow picks one random row matching where, first trying the narrower
// preferWhere and widening to where only when the preferred set is empty. That
// two-tier shape is what makes simulated engagement look considered rather than
// uniform: callers prefer recently posted content, or the follow nobody
// reciprocated, and still degrade to the full set instead of doing nothing.
// Pass an empty preferWhere to skip the preference.
//
// Selection is count-then-random-offset rather than ORDER BY random(), so the
// cost stays at two cheap queries as the content tables grow. from, cols and
// the where clauses are trusted constants built in this file; every
// caller-supplied value is passed as a query parameter.
func (r *SimulationRepository) randomRow(ctx context.Context, from, cols, where, preferWhere string, args []any, dest ...any) error {
	clauses := make([]string, 0, 2)
	if preferWhere != "" {
		clauses = append(clauses, preferWhere)
	}
	clauses = append(clauses, where)

	offsetParam := fmt.Sprintf("$%d", len(args)+1)
	for _, clause := range clauses {
		var n int
		if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM `+from+` WHERE `+clause, args...).Scan(&n); err != nil {
			return fmt.Errorf("count random row: %w", err)
		}
		if n == 0 {
			continue
		}
		selectArgs := append(append(make([]any, 0, len(args)+1), args...), n)
		err := r.db.QueryRow(ctx,
			`SELECT `+cols+` FROM `+from+` WHERE `+clause+`
			 OFFSET floor(random() * `+offsetParam+`) LIMIT 1`,
			selectArgs...,
		).Scan(dest...)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return fmt.Errorf("select random row: %w", err)
		}
		return nil
	}
	return ErrNotFound
}

// CreateSimulatedUser inserts a flagged simulated account with an explicit
// join date, so a freshly provisioned roster reads as a community that grew
// over time rather than one that appeared in a single afternoon. Returns the
// new id, or ErrConflict if the generated email collides with an existing row.
func (r *SimulationRepository) CreateSimulatedUser(ctx context.Context, email, displayName, passwordHash string, createdAt time.Time) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (email, display_name, password_hash, is_simulated, created_at, updated_at)
		VALUES ($1, $2, $3, TRUE, $4, $4)
		RETURNING id
	`, email, displayName, passwordHash, createdAt).Scan(&id)
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

// IsSimulatedUser reports whether the given user id is a flagged simulated
// account. Used to guard admin operations that should only target personas.
func (r *SimulationRepository) IsSimulatedUser(ctx context.Context, userID string) (bool, error) {
	var ok bool
	if err := r.db.QueryRow(ctx, `SELECT is_simulated FROM users WHERE id = $1`, userID).Scan(&ok); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrNotFound
		}
		return false, fmt.Errorf("check is_simulated: %w", err)
	}
	return ok, nil
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

// PersonaSeed is the stored identity of a simulated account that the engine
// needs in order to stay consistent with what a visitor sees on the profile —
// currently just the join date, which bounds how far back the persona's score
// cards can be dated.
type PersonaSeed struct {
	ID       string
	JoinedAt time.Time
}

// ListSimulatedPersonaSeeds returns up to limit simulated accounts, oldest
// first.
func (r *SimulationRepository) ListSimulatedPersonaSeeds(ctx context.Context, limit int) ([]PersonaSeed, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text, created_at FROM users WHERE is_simulated ORDER BY created_at LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list simulated users: %w", err)
	}
	defer rows.Close()
	var seeds []PersonaSeed
	for rows.Next() {
		var s PersonaSeed
		if err := rows.Scan(&s.ID, &s.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan simulated user seed: %w", err)
		}
		seeds = append(seeds, s)
	}
	return seeds, rows.Err()
}

// ListDisplayNames returns every display name already in use, so newly
// provisioned personas can avoid handing the community two members with the
// same name.
func (r *SimulationRepository) ListDisplayNames(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT display_name FROM users`)
	if err != nil {
		return nil, fmt.Errorf("list display names: %w", err)
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, fmt.Errorf("scan display name: %w", err)
		}
		names = append(names, n)
	}
	return names, rows.Err()
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

// SimCard is a random score card chosen as an interaction target, carrying
// enough of the card for the engine to react to what it is actually looking at
// rather than praising every card identically.
type SimCard struct {
	ID         string
	OwnerID    string
	TotalScore int16
	XCount     int16
}

// RandomPublicCard picks a random public, non-draft score card not owned by
// excludeUserID, preferring recently posted ones. When simulatedOnly is true,
// only cards owned by simulated accounts are eligible (keeps simulated
// interaction off real users' content). ErrNotFound when none is eligible.
func (r *SimulationRepository) RandomPublicCard(ctx context.Context, excludeUserID string, simulatedOnly bool) (*SimCard, error) {
	where := eligibleCardWhere(simulatedOnly)
	var c SimCard
	err := r.randomRow(ctx,
		`score_cards sc JOIN users u ON u.id = sc.user_id`,
		`sc.id::text, sc.user_id::text, sc.total_score, sc.x_count`,
		where,
		where+` AND sc.created_at > NOW() - INTERVAL '`+simRecentWindow+`'`,
		[]any{excludeUserID},
		&c.ID, &c.OwnerID, &c.TotalScore, &c.XCount,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
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
	var id string
	err := r.randomRow(ctx, `users u`, `u.id::text`,
		eligibleFollowWhere(simulatedOnly), "", []any{excludeUserID}, &id)
	return id, err
}

// RandomFollowBackTarget picks a random user who already follows
// excludeUserID but is not followed back. Real follow graphs are strongly
// reciprocal, so the engine reaches for this before following a stranger.
// ErrNotFound when every follower is already followed back.
func (r *SimulationRepository) RandomFollowBackTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	where := eligibleFollowWhere(simulatedOnly) + ` AND EXISTS (
		SELECT 1 FROM user_follows inbound
		WHERE inbound.follower_id = u.id AND inbound.following_id = $1
	)`
	var id string
	err := r.randomRow(ctx, `users u`, `u.id::text`, where, "", []any{excludeUserID}, &id)
	return id, err
}

// RandomMutualFollowTarget picks a random user followed by someone
// excludeUserID already follows. Following friends-of-friends grows the follow
// graph into overlapping clusters — the shape a real community has — instead of
// the uniform mesh that picking strangers produces. ErrNotFound when no such
// user exists.
func (r *SimulationRepository) RandomMutualFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	where := eligibleFollowWhere(simulatedOnly) + ` AND EXISTS (
		SELECT 1 FROM user_follows mine
		JOIN user_follows theirs ON theirs.follower_id = mine.following_id
		WHERE mine.follower_id = $1 AND theirs.following_id = u.id
	)`
	var id string
	err := r.randomRow(ctx, `users u`, `u.id::text`, where, "", []any{excludeUserID}, &id)
	return id, err
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

// DeleteSimulatedAvatarURL clears the avatar_url on a simulated account. Returns
// ErrNotFound when the target is missing or is not a simulated account.
func (r *SimulationRepository) DeleteSimulatedAvatarURL(ctx context.Context, id string) (*model.AdminUser, error) {
	u, err := scanAdminUser(r.db.QueryRow(ctx, `
		UPDATE users
		SET avatar_url = NULL, updated_at = NOW()
		WHERE id = $1 AND is_simulated
		RETURNING `+adminUserColumns+`
	`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("delete simulated avatar: %w", err)
	}
	return u, nil
}

// eligiblePostWhere returns the WHERE clause for RandomPublicPost.
func eligiblePostWhere(simulatedOnly bool) string {
	q := `p.visibility = 'public' AND p.hidden_at IS NULL AND p.user_id <> $1`
	if simulatedOnly {
		q += ` AND u.is_simulated`
	}
	return q
}

// RandomPublicPost picks a random public, non-hidden post not owned by
// excludeUserID, preferring recent ones. When simulatedOnly is true, only posts
// by simulated accounts are eligible. ErrNotFound when no eligible post exists.
func (r *SimulationRepository) RandomPublicPost(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	where := eligiblePostWhere(simulatedOnly)
	var id string
	err := r.randomRow(ctx,
		`posts p JOIN users u ON u.id = p.user_id`,
		`p.id::text`,
		where,
		where+` AND p.created_at > NOW() - INTERVAL '`+simRecentWindow+`'`,
		[]any{excludeUserID},
		&id,
	)
	return id, err
}

// eligibleActivityWhere returns the WHERE clause for RandomActivity.
func eligibleActivityWhere(simulatedOnly bool) string {
	q := `a.visibility = 'public' AND a.hidden_at IS NULL AND a.user_id <> $1`
	if simulatedOnly {
		q += ` AND u.is_simulated`
	}
	return q
}

// RandomActivity picks a random public, non-hidden activity not owned by
// excludeUserID, preferring recent ones. When simulatedOnly is true, only
// activities by simulated accounts are eligible. ErrNotFound when none exists.
func (r *SimulationRepository) RandomActivity(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	where := eligibleActivityWhere(simulatedOnly)
	var id string
	err := r.randomRow(ctx,
		`activities a JOIN users u ON u.id = a.user_id`,
		`a.id::text`,
		where,
		where+` AND a.created_at > NOW() - INTERVAL '`+simRecentWindow+`'`,
		[]any{excludeUserID},
		&id,
	)
	return id, err
}

// RandomTopLevelComment picks a random top-level comment on the given target
// that excludeUserID did not write, so a persona can reply into an existing
// thread instead of only ever adding another top-level remark. Returns the
// comment id and its author's display name. When simulatedOnly is true only
// comments by simulated accounts are eligible: the target being simulated says
// nothing about who commented on it, and replying would pull a real user into
// a conversation they did not ask for. ErrNotFound when there is nothing to
// reply to.
func (r *SimulationRepository) RandomTopLevelComment(ctx context.Context, targetID, targetType, excludeUserID string, simulatedOnly bool) (string, string, error) {
	where := `c.target_id = $1 AND c.target_type = $2 AND c.parent_id IS NULL AND c.user_id <> $3`
	if simulatedOnly {
		where += ` AND u.is_simulated`
	}
	var id, author string
	err := r.randomRow(ctx,
		`comments c JOIN users u ON u.id = c.user_id`,
		`c.id::text, u.display_name`,
		where,
		"",
		[]any{targetID, targetType, excludeUserID},
		&id, &author,
	)
	if err != nil {
		return "", "", err
	}
	return id, author, nil
}

// RandomLikeableComment picks a random recent comment not written by
// excludeUserID. When simulatedOnly is true, only comments by simulated
// accounts are eligible. ErrNotFound when none exists.
func (r *SimulationRepository) RandomLikeableComment(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error) {
	where := `c.user_id <> $1`
	if simulatedOnly {
		where += ` AND u.is_simulated`
	}
	var id string
	err := r.randomRow(ctx,
		`comments c JOIN users u ON u.id = c.user_id`,
		`c.id::text`,
		where,
		where+` AND c.created_at > NOW() - INTERVAL '`+simRecentWindow+`'`,
		[]any{excludeUserID},
		&id,
	)
	return id, err
}

// RandomFollowedUser picks a random user that followerID currently follows,
// preferring one who never followed back — the follow a real person is most
// likely to drop. When simulatedOnly is true, only simulated followees are
// eligible. ErrNotFound when the actor follows no one eligible.
func (r *SimulationRepository) RandomFollowedUser(ctx context.Context, followerID string, simulatedOnly bool) (string, error) {
	where := `f.follower_id = $1 AND u.id <> $1 AND u.profile_visibility = 'public'`
	if simulatedOnly {
		where += ` AND u.is_simulated`
	}
	unreciprocated := where + ` AND NOT EXISTS (
		SELECT 1 FROM user_follows back
		WHERE back.follower_id = u.id AND back.following_id = $1
	)`
	var id string
	err := r.randomRow(ctx,
		`user_follows f JOIN users u ON u.id = f.following_id`,
		`u.id::text`,
		where,
		unreciprocated,
		[]any{followerID},
		&id,
	)
	return id, err
}
