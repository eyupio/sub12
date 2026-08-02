package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type EventRepository struct {
	db *pgxpool.Pool
}

func NewEventRepository(db *pgxpool.Pool) *EventRepository {
	return &EventRepository{db: db}
}

// ErrEventFull is returned when a join would exceed the event's
// max_participants cap.
var ErrEventFull = errors.New("event is full")

const eventColumns = `
	e.id, e.slug, e.name, e.description, e.location,
	e.starts_at, e.ends_at, e.archive_at,
	e.discipline, e.format, e.course, e.scoring_rules, e.category_ids,
	e.visibility, e.state, e.owner_user_id, e.club_id, e.max_participants,
	e.require_score_verification, e.required_confirmations,
	e.require_image_upload, e.lock_edits_after_verification,
	e.created_at, e.updated_at
`

func scanEvent(row pgx.Row, e *model.Event) error {
	var courseRaw, rulesRaw []byte
	if err := row.Scan(
		&e.ID, &e.Slug, &e.Name, &e.Description, &e.Location,
		&e.StartsAt, &e.EndsAt, &e.ArchiveAt,
		&e.Discipline, &e.Format, &courseRaw, &rulesRaw, &e.CategoryIDs,
		&e.Visibility, &e.State, &e.OwnerUserID, &e.ClubID, &e.MaxParticipants,
		&e.RequireScoreVerification, &e.RequiredConfirmations,
		&e.RequireImageUpload, &e.LockEditsAfterVerification,
		&e.CreatedAt, &e.UpdatedAt,
	); err != nil {
		return err
	}
	if len(courseRaw) > 0 {
		_ = json.Unmarshal(courseRaw, &e.Course)
	}
	if len(rulesRaw) > 0 {
		_ = json.Unmarshal(rulesRaw, &e.ScoringRules)
	}
	if e.CategoryIDs == nil {
		e.CategoryIDs = []string{}
	}
	return nil
}

// generateSlug creates a 12-char URL-safe slug. Mirrors the standalone app's
// "Event ID" format. Collisions are vanishingly unlikely; on the off chance,
// retry up to 3 times.
func generateSlug() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Create inserts a new event. Caller is responsible for validating club admin.
func (r *EventRepository) Create(ctx context.Context, ownerID string, in *model.CreateEventInput) (*model.Event, error) {
	courseJSON, err := json.Marshal(in.Course)
	if err != nil {
		return nil, fmt.Errorf("marshal course: %w", err)
	}
	rulesJSON, err := json.Marshal(in.ScoringRules)
	if err != nil {
		return nil, fmt.Errorf("marshal scoring rules: %w", err)
	}

	visibility := model.EventVisibilityPublic
	if in.Visibility != nil && *in.Visibility != "" {
		visibility = *in.Visibility
	}

	categoryIDs := in.CategoryIDs
	if categoryIDs == nil {
		categoryIDs = []string{}
	}

	format := model.EventFormatShotGrid
	if in.Format != nil && *in.Format != "" {
		format = *in.Format
	}
	requireVerify := false
	if in.RequireScoreVerification != nil {
		requireVerify = *in.RequireScoreVerification
	}
	requiredConfirmations := int16(1)
	if in.RequiredConfirmations != nil {
		requiredConfirmations = *in.RequiredConfirmations
	}
	requireImage := false
	if in.RequireImageUpload != nil {
		requireImage = *in.RequireImageUpload
	}
	lockAfterVerify := true
	if in.LockEditsAfterVerification != nil {
		lockAfterVerify = *in.LockEditsAfterVerification
	}

	for attempt := 0; attempt < 3; attempt++ {
		slug, err := generateSlug()
		if err != nil {
			return nil, err
		}
		var ev model.Event
		row := r.db.QueryRow(ctx, `
			INSERT INTO events AS e (
				slug, name, description, location, starts_at, ends_at,
				discipline, format, course, scoring_rules, category_ids,
				visibility, state, owner_user_id, club_id, max_participants,
				require_score_verification, required_confirmations,
				require_image_upload, lock_edits_after_verification
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9::jsonb, $10::jsonb, $11::uuid[],
				$12, 'draft', $13, $14, $15,
				$16, $17, $18, $19
			)
			RETURNING `+eventColumns+`
		`, slug, in.Name, in.Description, in.Location, in.StartsAt, in.EndsAt,
			in.Discipline, format, courseJSON, rulesJSON, categoryIDs,
			visibility, ownerID, in.ClubID, in.MaxParticipants,
			requireVerify, requiredConfirmations, requireImage, lockAfterVerify,
		)
		err = scanEvent(row, &ev)
		if err == nil {
			return &ev, nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "slug") {
			continue // retry on slug collision
		}
		return nil, fmt.Errorf("insert event: %w", err)
	}
	return nil, fmt.Errorf("insert event: slug collision after 3 attempts")
}

// scanEventWithCount scans an event row that has participant_count appended as
// the trailing column. Used by GetBySlug / List / ListByClub.
func scanEventWithCount(row pgx.Row, e *model.Event) error {
	var courseRaw, rulesRaw []byte
	if err := row.Scan(
		&e.ID, &e.Slug, &e.Name, &e.Description, &e.Location,
		&e.StartsAt, &e.EndsAt, &e.ArchiveAt,
		&e.Discipline, &e.Format, &courseRaw, &rulesRaw, &e.CategoryIDs,
		&e.Visibility, &e.State, &e.OwnerUserID, &e.ClubID, &e.MaxParticipants,
		&e.RequireScoreVerification, &e.RequiredConfirmations,
		&e.RequireImageUpload, &e.LockEditsAfterVerification,
		&e.CreatedAt, &e.UpdatedAt,
		&e.ParticipantCount,
	); err != nil {
		return err
	}
	if len(courseRaw) > 0 {
		_ = json.Unmarshal(courseRaw, &e.Course)
	}
	if len(rulesRaw) > 0 {
		_ = json.Unmarshal(rulesRaw, &e.ScoringRules)
	}
	if e.CategoryIDs == nil {
		e.CategoryIDs = []string{}
	}
	return nil
}

// GetBySlug returns the event identified by slug along with its participant
// count.
func (r *EventRepository) GetBySlug(ctx context.Context, slug string) (*model.Event, error) {
	var e model.Event
	row := r.db.QueryRow(ctx, `
		SELECT `+eventColumns+`,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count
		FROM events e
		WHERE e.slug = $1
	`, strings.ToLower(strings.TrimSpace(slug)))
	if err := scanEventWithCount(row, &e); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get event by slug: %w", err)
	}
	return &e, nil
}

func (r *EventRepository) GetByID(ctx context.Context, id string) (*model.Event, error) {
	var e model.Event
	row := r.db.QueryRow(ctx, `
		SELECT `+eventColumns+`,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count
		FROM events e WHERE e.id = $1
	`, id)
	if err := scanEventWithCount(row, &e); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get event: %w", err)
	}
	return &e, nil
}

// List returns events for the public directory. Only public-visibility,
// non-draft events are listed for everyone; an authenticated viewer also sees
// their own events regardless of visibility or draft state (unlisted events
// stay link-only for everyone else). Archived events never appear.
func (r *EventRepository) List(ctx context.Context, viewerID string, stateFilter string) ([]*model.Event, error) {
	args := []any{}
	visible := `(e.visibility = 'public' AND e.state != 'draft')`
	if viewerID != "" {
		visible = fmt.Sprintf(`((e.visibility = 'public' AND e.state != 'draft') OR e.owner_user_id = $%d)`, len(args)+1)
		args = append(args, viewerID)
	}
	conds := []string{visible, `e.state != 'archived'`}
	if stateFilter != "" {
		conds = append(conds, fmt.Sprintf("e.state = $%d", len(args)+1))
		args = append(args, stateFilter)
	}
	where := strings.Join(conds, " AND ")

	rows, err := r.db.Query(ctx, `
		SELECT `+eventColumns+`,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count
		FROM events e
		WHERE `+where+`
		ORDER BY COALESCE(e.starts_at, e.created_at) DESC
		LIMIT 200
	`, args...)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()
	var items []*model.Event
	for rows.Next() {
		var e model.Event
		if err := scanEventWithCount(rows, &e); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		items = append(items, &e)
	}
	return items, rows.Err()
}

// ListByClub returns events hosted under a club (any state except archived).
// Drafts are only visible to their owner. Caller is responsible for
// membership checks.
func (r *EventRepository) ListByClub(ctx context.Context, clubID, viewerID string) ([]*model.Event, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+eventColumns+`,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count
		FROM events e
		WHERE e.club_id = $1 AND e.state != 'archived'
		  AND (e.state != 'draft' OR e.owner_user_id = NULLIF($2, '')::uuid)
		ORDER BY COALESCE(e.starts_at, e.created_at) DESC
	`, clubID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list events by club: %w", err)
	}
	defer rows.Close()
	var items []*model.Event
	for rows.Next() {
		var e model.Event
		if err := scanEventWithCount(rows, &e); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		items = append(items, &e)
	}
	return items, rows.Err()
}

// ListByUser returns events the user owns or is a participant in, excluding
// archived events. Sorted with live/open events first, then by start date.
func (r *EventRepository) ListByUser(ctx context.Context, userID string) ([]*model.MyEventSummary, error) {
	rows, err := r.db.Query(ctx, `
		SELECT e.id, e.slug, e.name, e.starts_at, e.ends_at, e.state, e.discipline, e.format,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count,
			(e.owner_user_id = $1) AS is_owner
		FROM events e
		WHERE e.state != 'archived'
		  AND (e.owner_user_id = $1
		       OR EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.user_id = $1))
		ORDER BY
			CASE e.state
				WHEN 'live' THEN 0
				WHEN 'open_for_entries' THEN 1
				WHEN 'draft' THEN 2
				ELSE 3
			END,
			COALESCE(e.starts_at, e.created_at) DESC
		LIMIT 50
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list events by user: %w", err)
	}
	defer rows.Close()
	var items []*model.MyEventSummary
	for rows.Next() {
		var s model.MyEventSummary
		if err := rows.Scan(
			&s.ID, &s.Slug, &s.Name, &s.StartsAt, &s.EndsAt, &s.State, &s.Discipline, &s.Format,
			&s.ParticipantCount, &s.IsOwner,
		); err != nil {
			return nil, fmt.Errorf("scan my event: %w", err)
		}
		items = append(items, &s)
	}
	return items, rows.Err()
}

// Update applies a partial update.
func (r *EventRepository) Update(ctx context.Context, id string, in *model.UpdateEventInput) (*model.Event, error) {
	var courseJSON, rulesJSON []byte
	if in.Course != nil {
		b, err := json.Marshal(*in.Course)
		if err != nil {
			return nil, fmt.Errorf("marshal course: %w", err)
		}
		courseJSON = b
	}
	if in.ScoringRules != nil {
		b, err := json.Marshal(*in.ScoringRules)
		if err != nil {
			return nil, fmt.Errorf("marshal scoring rules: %w", err)
		}
		rulesJSON = b
	}

	var categoryIDs []string
	if in.CategoryIDs != nil {
		categoryIDs = *in.CategoryIDs
	}

	row := r.db.QueryRow(ctx, `
		UPDATE events AS e SET
			name                          = COALESCE($2, name),
			description                   = COALESCE($3, description),
			location                      = COALESCE($4, location),
			starts_at                     = COALESCE($5, starts_at),
			ends_at                       = COALESCE($6, ends_at),
			discipline                    = COALESCE($7, discipline),
			course                        = COALESCE($8::jsonb, course),
			scoring_rules                 = COALESCE($9::jsonb, scoring_rules),
			category_ids                  = CASE WHEN $11::boolean THEN $10::uuid[] ELSE category_ids END,
			visibility                    = COALESCE($12, visibility),
			format                        = COALESCE($13, format),
			max_participants              = CASE WHEN $18::boolean THEN NULLIF($19::int, 0) ELSE max_participants END,
			require_score_verification    = COALESCE($14, require_score_verification),
			required_confirmations        = COALESCE($15, required_confirmations),
			require_image_upload          = COALESCE($16, require_image_upload),
			lock_edits_after_verification = COALESCE($17, lock_edits_after_verification),
			updated_at                    = NOW()
		WHERE id = $1
		RETURNING `+eventColumns+`
	`,
		id,
		in.Name,
		in.Description,
		in.Location,
		in.StartsAt,
		in.EndsAt,
		in.Discipline,
		courseJSON,
		rulesJSON,
		categoryIDs,
		in.CategoryIDs != nil,
		in.Visibility,
		in.Format,
		in.RequireScoreVerification,
		in.RequiredConfirmations,
		in.RequireImageUpload,
		in.LockEditsAfterVerification,
		in.MaxParticipants != nil,
		in.MaxParticipants,
	)
	var e model.Event
	if err := scanEvent(row, &e); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update event: %w", err)
	}
	return &e, nil
}

// SetState transitions the event to a new state. archiveAt may be nil.
func (r *EventRepository) SetState(ctx context.Context, id, state string, archiveAt *time.Time) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE events SET state = $2, archive_at = COALESCE($3, archive_at), updated_at = NOW()
		WHERE id = $1
	`, id, state, archiveAt)
	if err != nil {
		return fmt.Errorf("set event state: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reopen flips a 'complete' event back to 'live' and clears its archive_at
// stamp so the daily archive sweep doesn't catch it. Used when the owner
// closed the event by mistake.
func (r *EventRepository) Reopen(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE events SET state = 'live', archive_at = NULL, updated_at = NOW()
		WHERE id = $1 AND state = 'complete'
	`, id)
	if err != nil {
		return fmt.Errorf("reopen event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// HasCompletionActivity reports whether an event_results_posted aggregate has
// already been ingested for this event. Used as an idempotency guard so a
// reopen → re-complete cycle doesn't duplicate the public results post.
func (r *EventRepository) HasCompletionActivity(ctx context.Context, eventID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM activities
			WHERE target_id = $1 AND target_type = 'event' AND type = $2
		)
	`, eventID, model.ActivityEventResultsPosted).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("has completion activity: %w", err)
	}
	return ok, nil
}

// IsOwner returns true when userID owns the event.
func (r *EventRepository) IsOwner(ctx context.Context, eventID, userID string) (bool, error) {
	var owner string
	err := r.db.QueryRow(ctx, `SELECT owner_user_id FROM events WHERE id = $1`, eventID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, fmt.Errorf("event owner check: %w", err)
	}
	return owner == userID, nil
}

// IsScorer returns true if userID is the owner OR has a row in event_scorers.
func (r *EventRepository) IsScorer(ctx context.Context, eventID, userID string) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM events WHERE id = $1 AND owner_user_id = $2
		) OR EXISTS (
			SELECT 1 FROM event_scorers WHERE event_id = $1 AND user_id = $2
		)
	`, eventID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("scorer check: %w", err)
	}
	return ok, nil
}

// ListScorerIDs returns the event owner plus every delegated scorer — the set
// of people who can rule on a submitted card.
func (r *EventRepository) ListScorerIDs(ctx context.Context, eventID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT owner_user_id FROM events WHERE id = $1
		UNION
		SELECT user_id FROM event_scorers WHERE event_id = $1
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event scorer ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan event scorer id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListParticipantUserIDs returns the account-backed participants of an event.
// Guests have no user_id and are skipped — there is nobody to notify.
func (r *EventRepository) ListParticipantUserIDs(ctx context.Context, eventID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT user_id FROM event_participants
		WHERE event_id = $1 AND user_id IS NOT NULL
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event participant ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan event participant id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// AddScorer grants delegated scorer rights.
func (r *EventRepository) AddScorer(ctx context.Context, eventID, userID, grantedBy string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO event_scorers (event_id, user_id, granted_by)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, eventID, userID, grantedBy)
	if err != nil {
		return fmt.Errorf("add scorer: %w", err)
	}
	return nil
}

// EventScorerRow is a delegated scorer joined with their display identity.
type EventScorerRow struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

// ListScorers returns the delegated scorers for an event (the owner is not
// included — ownership implies scoring rights).
func (r *EventRepository) ListScorers(ctx context.Context, eventID string) ([]*EventScorerRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.user_id, COALESCE(u.display_name, '') AS display_name, u.avatar_url
		FROM event_scorers s
		LEFT JOIN users u ON u.id = s.user_id
		WHERE s.event_id = $1
		ORDER BY display_name
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list scorers: %w", err)
	}
	defer rows.Close()
	var items []*EventScorerRow
	for rows.Next() {
		var s EventScorerRow
		if err := rows.Scan(&s.UserID, &s.DisplayName, &s.AvatarURL); err != nil {
			return nil, fmt.Errorf("scan scorer: %w", err)
		}
		items = append(items, &s)
	}
	return items, rows.Err()
}

// RemoveScorer revokes delegated scorer rights.
func (r *EventRepository) RemoveScorer(ctx context.Context, eventID, userID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM event_scorers WHERE event_id = $1 AND user_id = $2
	`, eventID, userID)
	if err != nil {
		return fmt.Errorf("remove scorer: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// reserveCapacity locks the event row and returns ErrEventFull when the
// participant count has already reached max_participants. Must run inside the
// same transaction as the insert so concurrent joins serialise on the lock
// and cannot overshoot the cap.
func reserveCapacity(ctx context.Context, tx pgx.Tx, eventID string) error {
	var maxParticipants *int
	if err := tx.QueryRow(ctx, `
		SELECT max_participants FROM events WHERE id = $1 FOR UPDATE
	`, eventID).Scan(&maxParticipants); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("lock event for capacity check: %w", err)
	}
	if maxParticipants == nil {
		return nil
	}
	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM event_participants WHERE event_id = $1
	`, eventID).Scan(&count); err != nil {
		return fmt.Errorf("count participants: %w", err)
	}
	if count >= *maxParticipants {
		return ErrEventFull
	}
	return nil
}

// AddRegisteredParticipant joins a registered user to the event. Returns
// ErrConflict if the user is already a participant and ErrEventFull when the
// event's capacity has been reached.
func (r *EventRepository) AddRegisteredParticipant(ctx context.Context, eventID, userID, createdBy string, in *model.JoinEventInput) (*model.EventParticipant, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := reserveCapacity(ctx, tx, eventID); err != nil {
		return nil, err
	}

	var p model.EventParticipant
	err = tx.QueryRow(ctx, `
		INSERT INTO event_participants (
			event_id, user_id, team, category_id, weapon_class, weapon_label, lane_assignment, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, event_id, user_id, guest_name, team, category_id, weapon_class, weapon_label, lane_assignment, scorecard_id, created_by, created_at
	`, eventID, userID, in.Team, in.CategoryID, in.WeaponClass, in.WeaponLabel, in.LaneAssignment, createdBy).Scan(
		&p.ID, &p.EventID, &p.UserID, &p.GuestName, &p.Team, &p.CategoryID,
		&p.WeaponClass, &p.WeaponLabel, &p.LaneAssignment, &p.ScorecardID, &p.CreatedBy, &p.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("add participant: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit participant: %w", err)
	}
	return &p, nil
}

// AddGuest adds a guest (non-account) participant. Multiple guests per event
// are allowed (no uniqueness on guest_name); the capacity cap still applies.
func (r *EventRepository) AddGuest(ctx context.Context, eventID, createdBy string, in *model.AddGuestInput) (*model.EventParticipant, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := reserveCapacity(ctx, tx, eventID); err != nil {
		return nil, err
	}

	var p model.EventParticipant
	err = tx.QueryRow(ctx, `
		INSERT INTO event_participants (
			event_id, guest_name, team, category_id, weapon_class, weapon_label, lane_assignment, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, event_id, user_id, guest_name, team, category_id, weapon_class, weapon_label, lane_assignment, scorecard_id, created_by, created_at
	`, eventID, in.GuestName, in.Team, in.CategoryID, in.WeaponClass, in.WeaponLabel, in.LaneAssignment, createdBy).Scan(
		&p.ID, &p.EventID, &p.UserID, &p.GuestName, &p.Team, &p.CategoryID,
		&p.WeaponClass, &p.WeaponLabel, &p.LaneAssignment, &p.ScorecardID, &p.CreatedBy, &p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("add guest: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit guest: %w", err)
	}
	return &p, nil
}

// RemoveParticipant deletes a participant (and cascades scores via FK).
func (r *EventRepository) RemoveParticipant(ctx context.Context, eventID, participantID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM event_participants WHERE id = $1 AND event_id = $2
	`, participantID, eventID)
	if err != nil {
		return fmt.Errorf("remove participant: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListParticipants returns participants with display_name COALESCE'd from
// users.display_name (registered) or guest_name (non-account).
func (r *EventRepository) ListParticipants(ctx context.Context, eventID string) ([]*model.EventParticipant, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id, p.event_id, p.user_id, p.guest_name,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.team, p.category_id, p.weapon_class, p.weapon_label, p.lane_assignment,
			p.scorecard_id, p.created_by, p.created_at
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.event_id = $1
		ORDER BY p.lane_assignment NULLS LAST, p.created_at
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list participants: %w", err)
	}
	defer rows.Close()
	var items []*model.EventParticipant
	for rows.Next() {
		var p model.EventParticipant
		if err := rows.Scan(
			&p.ID, &p.EventID, &p.UserID, &p.GuestName, &p.DisplayName,
			&p.Team, &p.CategoryID, &p.WeaponClass, &p.WeaponLabel, &p.LaneAssignment,
			&p.ScorecardID, &p.CreatedBy, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan participant: %w", err)
		}
		items = append(items, &p)
	}
	return items, rows.Err()
}

// GetParticipant fetches a single participant for visibility/permission checks.
func (r *EventRepository) GetParticipant(ctx context.Context, participantID string) (*model.EventParticipant, error) {
	var p model.EventParticipant
	err := r.db.QueryRow(ctx, `
		SELECT
			p.id, p.event_id, p.user_id, p.guest_name,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.team, p.category_id, p.weapon_class, p.weapon_label, p.lane_assignment,
			p.scorecard_id, p.created_by, p.created_at
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.id = $1
	`, participantID).Scan(
		&p.ID, &p.EventID, &p.UserID, &p.GuestName, &p.DisplayName,
		&p.Team, &p.CategoryID, &p.WeaponClass, &p.WeaponLabel, &p.LaneAssignment,
		&p.ScorecardID, &p.CreatedBy, &p.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get participant: %w", err)
	}
	return &p, nil
}

// GetParticipantByEventAndUser returns the given user's own entry in an
// event, or ErrNotFound when they never joined it. Guests have no user_id and
// are never returned here.
func (r *EventRepository) GetParticipantByEventAndUser(ctx context.Context, eventID, userID string) (*model.EventParticipant, error) {
	var p model.EventParticipant
	err := r.db.QueryRow(ctx, `
		SELECT
			p.id, p.event_id, p.user_id, p.guest_name,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.team, p.category_id, p.weapon_class, p.weapon_label, p.lane_assignment,
			p.scorecard_id, p.created_by, p.created_at
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.event_id = $1 AND p.user_id = $2
		ORDER BY p.created_at
		LIMIT 1
	`, eventID, userID).Scan(
		&p.ID, &p.EventID, &p.UserID, &p.GuestName, &p.DisplayName,
		&p.Team, &p.CategoryID, &p.WeaponClass, &p.WeaponLabel, &p.LaneAssignment,
		&p.ScorecardID, &p.CreatedBy, &p.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get participant by event and user: %w", err)
	}
	return &p, nil
}

// UpsertScores inserts or updates a batch of shot results. Idempotent on
// client_id (secondary key) and (participant_id, lane, shot_number)
// (primary). Returns the count of rows that hit the table (insert + update).
func (r *EventRepository) UpsertScores(ctx context.Context, eventID, recordedBy string, scores []model.RecordScoreItem) (int, error) {
	if len(scores) == 0 {
		return 0, nil
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Verify every participant_id belongs to this event so a malicious caller
	// can't update scores in another event by passing a foreign participant_id.
	pids := make([]string, 0, len(scores))
	seen := map[string]struct{}{}
	for _, s := range scores {
		if _, ok := seen[s.ParticipantID]; ok {
			continue
		}
		seen[s.ParticipantID] = struct{}{}
		pids = append(pids, s.ParticipantID)
	}
	var matched int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM event_participants WHERE event_id = $1 AND id = ANY($2)
	`, eventID, pids).Scan(&matched); err != nil {
		return 0, fmt.Errorf("validate participants: %w", err)
	}
	if matched != len(pids) {
		return 0, fmt.Errorf("%w: one or more participant_ids do not belong to this event", ErrNotFound)
	}

	written := 0
	for _, s := range scores {
		recordedAt := time.Now()
		if s.RecordedAt != nil {
			recordedAt = *s.RecordedAt
		}
		// Lane/shot bounds are validated in the service layer against the
		// event's course; nothing is silently clamped here.
		shot := s.ShotNumber
		tag, err := tx.Exec(ctx, `
			INSERT INTO event_scores (
				participant_id, lane, shot_number, result, note, recorded_at, recorded_by, client_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (participant_id, lane, shot_number)
			DO UPDATE SET
				result = EXCLUDED.result,
				note = EXCLUDED.note,
				recorded_at = EXCLUDED.recorded_at,
				recorded_by = EXCLUDED.recorded_by,
				client_id = EXCLUDED.client_id
		`, s.ParticipantID, s.Lane, shot, s.Result, s.Note, recordedAt, recordedBy, s.ClientID)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				// Duplicate client_id from a re-flush; ignore — already persisted.
				continue
			}
			return 0, fmt.Errorf("upsert score: %w", err)
		}
		if tag.RowsAffected() > 0 {
			written++
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit scores: %w", err)
	}
	return written, nil
}

// Standings aggregates scores into a sorted leaderboard. The scoring rules
// from the event determine point values per result token; everything not
// listed in Points contributes 0. shots_recorded counts all rows; hit_count
// counts rows whose Points value is > 0.
func (r *EventRepository) Standings(ctx context.Context, eventID string, rules model.EventScoringRules) ([]*model.EventStandingRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.user_id,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.team,
			p.category_id,
			cat.label AS category_label,
			p.weapon_class,
			COALESCE(
				(SELECT jsonb_object_agg(c.result, c.n)
				 FROM (
					SELECT result, COUNT(*)::int AS n
					FROM event_scores
					WHERE participant_id = p.id
					GROUP BY result
				 ) c),
				'{}'::jsonb
			) AS results,
			(SELECT COUNT(*)::int FROM event_scores WHERE participant_id = p.id) AS shots_recorded
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		WHERE p.event_id = $1
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("standings query: %w", err)
	}
	defer rows.Close()

	var items []*model.EventStandingRow
	for rows.Next() {
		var row model.EventStandingRow
		var resultsRaw []byte
		var shotsRecorded int
		if err := rows.Scan(
			&row.ParticipantID, &row.UserID, &row.DisplayName,
			&row.Team, &row.CategoryID, &row.CategoryLabel, &row.WeaponClass,
			&resultsRaw, &shotsRecorded,
		); err != nil {
			return nil, fmt.Errorf("scan standings: %w", err)
		}
		var counts map[string]int
		if len(resultsRaw) > 0 {
			_ = json.Unmarshal(resultsRaw, &counts)
		}
		points := 0
		hits := 0
		for token, n := range counts {
			if rules.Points != nil {
				if v, ok := rules.Points[token]; ok {
					points += v * n
					if v > 0 {
						hits += n
					}
				}
			} else {
				// Default heuristic when rules not set: anything other than
				// "O", "0", "MISS" counts as a hit worth 1.
				if !strings.EqualFold(token, "O") && token != "0" && !strings.EqualFold(token, "MISS") {
					points += n
					hits += n
				}
			}
		}
		row.Points = points
		row.HitCount = hits
		row.ShotsRecorded = shotsRecorded
		items = append(items, &row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Sort by points desc, hit_count desc, display_name asc.
	sortStandings(items)
	assignPositions(items)
	return items, nil
}

// StandingsFromCards aggregates a leaderboard for card_submission events. Each
// participant has at most one finalised score_card (enforced by the partial
// unique index); rows with no submission appear with Points/HitCount=0 and
// ShotsRecorded=0 so the UI can show "no card" rows alongside submissions.
func (r *EventRepository) StandingsFromCards(ctx context.Context, eventID string) ([]*model.EventStandingRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.user_id,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.team,
			p.category_id,
			p.weapon_class,
			COALESCE(sc.total_score, 0)::int AS points,
			COALESCE(sc.x_count, 0)::int AS hit_count,
			CASE WHEN sc.id IS NULL THEN 0 ELSE 25 END AS shots_recorded
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		LEFT JOIN score_cards sc
			ON sc.event_participant_id = p.id AND sc.is_draft = FALSE
		WHERE p.event_id = $1
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("standings from cards query: %w", err)
	}
	defer rows.Close()

	var items []*model.EventStandingRow
	for rows.Next() {
		var row model.EventStandingRow
		if err := rows.Scan(
			&row.ParticipantID, &row.UserID, &row.DisplayName,
			&row.Team, &row.CategoryID, &row.WeaponClass,
			&row.Points, &row.HitCount, &row.ShotsRecorded,
		); err != nil {
			return nil, fmt.Errorf("scan card standings: %w", err)
		}
		items = append(items, &row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sortStandings(items)
	assignPositions(items)
	return items, nil
}

// ListEventCards returns one row per participant with their card status (none /
// draft / submitted) for the GET /events/{slug}/cards endpoint.
func (r *EventRepository) ListEventCards(ctx context.Context, eventID string) ([]*model.EventCardStatus, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			COALESCE(u.display_name, p.guest_name) AS display_name,
			p.user_id,
			(p.user_id IS NULL) AS is_guest,
			sc.id, sc.is_draft, sc.total_score, sc.x_count,
			sc.card_image_url, sc.verification, sc.user_id AS submitted_by_user_id
		FROM event_participants p
		LEFT JOIN users u ON u.id = p.user_id
		LEFT JOIN LATERAL (
			SELECT id, is_draft, total_score, x_count, card_image_url,
				verification::text AS verification, user_id
			FROM score_cards
			WHERE event_participant_id = p.id
			ORDER BY is_draft ASC, created_at DESC
			LIMIT 1
		) sc ON TRUE
		WHERE p.event_id = $1
		ORDER BY p.lane_assignment NULLS LAST, p.created_at
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list event cards: %w", err)
	}
	defer rows.Close()
	var items []*model.EventCardStatus
	for rows.Next() {
		var s model.EventCardStatus
		if err := rows.Scan(
			&s.ParticipantID, &s.DisplayName, &s.UserID, &s.IsGuest,
			&s.CardID, &s.IsDraft, &s.TotalScore, &s.XCount,
			&s.CardImageURL, &s.Verification, &s.SubmittedByUserID,
		); err != nil {
			return nil, fmt.Errorf("scan event card status: %w", err)
		}
		items = append(items, &s)
	}
	return items, rows.Err()
}

func sortStandings(items []*model.EventStandingRow) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0; j-- {
			a, b := items[j-1], items[j]
			if a.Points < b.Points ||
				(a.Points == b.Points && a.HitCount < b.HitCount) ||
				(a.Points == b.Points && a.HitCount == b.HitCount &&
					strings.Compare(strings.ToLower(a.DisplayName), strings.ToLower(b.DisplayName)) > 0) {
				items[j-1], items[j] = items[j], items[j-1]
				continue
			}
			break
		}
	}
}

// assignPositions applies standard competition ranking ("1224"): rows tied on
// points and hit count share a position, and the next distinct result takes
// the position it would have held without the tie.
func assignPositions(items []*model.EventStandingRow) {
	for i := range items {
		if i > 0 && items[i].Points == items[i-1].Points && items[i].HitCount == items[i-1].HitCount {
			items[i].Position = items[i-1].Position
			continue
		}
		items[i].Position = i + 1
	}
}

// ListScoresForCSV returns every score row in lane/shot order for export.
func (r *EventRepository) ListScoresForCSV(ctx context.Context, eventID string) ([]*model.EventScore, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.id, s.participant_id, s.lane, s.shot_number, s.result, s.note, s.recorded_at, s.recorded_by, s.client_id
		FROM event_scores s
		JOIN event_participants p ON p.id = s.participant_id
		WHERE p.event_id = $1
		ORDER BY s.participant_id, s.lane, s.shot_number
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list scores for csv: %w", err)
	}
	defer rows.Close()
	var items []*model.EventScore
	for rows.Next() {
		var s model.EventScore
		if err := rows.Scan(&s.ID, &s.ParticipantID, &s.Lane, &s.ShotNumber, &s.Result, &s.Note, &s.RecordedAt, &s.RecordedBy, &s.ClientID); err != nil {
			return nil, fmt.Errorf("scan score: %w", err)
		}
		items = append(items, &s)
	}
	return items, rows.Err()
}

// ArchiveSweep flips completed events past their archive_at into the archived
// state. Returns the number of rows updated.
func (r *EventRepository) ArchiveSweep(ctx context.Context, now time.Time) (int, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE events
		SET state = 'archived', updated_at = NOW()
		WHERE state = 'complete' AND archive_at IS NOT NULL AND archive_at <= $1
	`, now)
	if err != nil {
		return 0, fmt.Errorf("archive sweep: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// AdminEventRow is a flattened row returned from AdminListAll. It includes
// joined club name and owner display name so the admin UI can render them
// without a follow-up fetch.
type AdminEventRow struct {
	model.Event
	ClubName        *string `json:"club_name,omitempty"`
	OwnerDisplayName string  `json:"owner_display_name"`
}

// AdminListAll returns every event regardless of visibility/state, joined with
// club name and owner display name. Intended for the platform-admin events
// list. Newest first; capped to 500 to keep the response bounded.
func (r *EventRepository) AdminListAll(ctx context.Context) ([]*AdminEventRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+eventColumns+`,
			(SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id) AS participant_count,
			c.name AS club_name,
			COALESCE(u.display_name, '') AS owner_display_name
		FROM events e
		LEFT JOIN clubs c ON c.id = e.club_id
		LEFT JOIN users u ON u.id = e.owner_user_id
		ORDER BY e.created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return nil, fmt.Errorf("admin list events: %w", err)
	}
	defer rows.Close()
	var items []*AdminEventRow
	for rows.Next() {
		var row AdminEventRow
		var courseRaw, rulesRaw []byte
		if err := rows.Scan(
			&row.ID, &row.Slug, &row.Name, &row.Description, &row.Location,
			&row.StartsAt, &row.EndsAt, &row.ArchiveAt,
			&row.Discipline, &row.Format, &courseRaw, &rulesRaw, &row.CategoryIDs,
			&row.Visibility, &row.State, &row.OwnerUserID, &row.ClubID, &row.MaxParticipants,
			&row.RequireScoreVerification, &row.RequiredConfirmations,
			&row.RequireImageUpload, &row.LockEditsAfterVerification,
			&row.CreatedAt, &row.UpdatedAt,
			&row.ParticipantCount,
			&row.ClubName,
			&row.OwnerDisplayName,
		); err != nil {
			return nil, fmt.Errorf("scan admin event: %w", err)
		}
		if len(courseRaw) > 0 {
			_ = json.Unmarshal(courseRaw, &row.Course)
		}
		if len(rulesRaw) > 0 {
			_ = json.Unmarshal(rulesRaw, &row.ScoringRules)
		}
		if row.CategoryIDs == nil {
			row.CategoryIDs = []string{}
		}
		items = append(items, &row)
	}
	return items, rows.Err()
}

// AdminDelete removes an event by ID, cascading via FKs to participants and
// scores. No ownership check; caller must have already gated on admin role.
func (r *EventRepository) AdminDelete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM events WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("admin delete event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountHostedByUser returns the number of events the user has owned that have
// reached state 'complete' (used for Host achievement tiers).
func (r *EventRepository) CountHostedByUser(ctx context.Context, userID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM events WHERE owner_user_id = $1 AND state IN ('complete','archived')
	`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count hosted events: %w", err)
	}
	return n, nil
}

// CountCompletedByUser returns the number of distinct completed events a
// registered user has participated in (used for Veteran tiers and First Live
// Event achievement).
func (r *EventRepository) CountCompletedByUser(ctx context.Context, userID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT e.id)
		FROM events e
		JOIN event_participants p ON p.event_id = e.id
		WHERE p.user_id = $1 AND e.state IN ('complete','archived')
	`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count completed events: %w", err)
	}
	return n, nil
}
