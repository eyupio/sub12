package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

type PelletTestRepository struct {
	db *pgxpool.Pool
}

func NewPelletTestRepository(db *pgxpool.Pool) *PelletTestRepository {
	return &PelletTestRepository{db: db}
}

// ── Session CRUD ────────────────────────────────────────────────────────────────

func scanSession(row pgx.Row) (*model.PelletTestSession, error) {
	var s model.PelletTestSession
	var testDate time.Time
	err := row.Scan(
		&s.ID, &s.UserID, &s.RifleID, &s.PelletID,
		&testDate, &s.DistanceM, &s.DistanceUnit,
		&s.Location, &s.WindMPH, &s.TempCelsius, &s.HumidityPct,
		&s.Notes,
		&s.VelocityFPS, &s.VelocitySD, &s.ExtremeSpreadFPS,
		&s.BenchSetup, &s.ScopeDetails, &s.BarometricPressureMbar,
		&s.AverageGroupSizeMM, &s.BestGroupSizeMM,
		&s.GroupCount, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	s.TestDate = testDate.Format("2006-01-02")
	return &s, nil
}

const sessionCols = `id, user_id, rifle_id, pellet_id, test_date, distance_m, distance_unit,
	location, wind_mph, temp_celsius, humidity_pct, notes,
	velocity_fps, velocity_sd, extreme_spread_fps,
	bench_setup, scope_details, barometric_pressure_mbar,
	average_group_size_mm, best_group_size_mm, group_count, created_at, updated_at`

func (r *PelletTestRepository) Create(ctx context.Context, userID string, in *model.CreatePelletTestSessionInput, distanceM float64) (*model.PelletTestSession, error) {
	session, err := scanSession(r.db.QueryRow(ctx, `
		INSERT INTO pellet_test_sessions (user_id, rifle_id, pellet_id, test_date, distance_m, distance_unit,
			location, wind_mph, temp_celsius, humidity_pct, notes,
			velocity_fps, velocity_sd, extreme_spread_fps,
			bench_setup, scope_details, barometric_pressure_mbar)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		RETURNING `+sessionCols+`
	`, userID, in.RifleID, in.PelletID, in.TestDate, distanceM, in.DistanceUnit,
		in.Location, in.WindMPH, in.TempCelsius, in.HumidityPct, in.Notes,
		in.VelocityFPS, in.VelocitySD, in.ExtremeSpreadFPS,
		in.BenchSetup, in.ScopeDetails, in.BarometricPressureMbar))
	if err != nil {
		return nil, fmt.Errorf("create pellet test session: %w", err)
	}
	return session, nil
}

func (r *PelletTestRepository) GetByID(ctx context.Context, id, userID string) (*model.PelletTestSession, error) {
	session, err := scanSession(r.db.QueryRow(ctx, `
		SELECT `+sessionCols+`
		FROM pellet_test_sessions WHERE id = $1 AND user_id = $2
	`, id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get pellet test session: %w", err)
	}

	// Load joined rifle
	rifle, err := scanRifle(r.db.QueryRow(ctx, `
		SELECT id, user_id, make, model, calibre, power_ftlb, tune_notes, image_url, is_active, created_at, updated_at
		FROM rifles WHERE id = $1
	`, session.RifleID))
	if err == nil {
		session.Rifle = rifle
	}

	// Load joined pellet
	pellet, err := scanPellet(r.db.QueryRow(ctx, `
		SELECT id, user_id, brand, model, head_size_mm, weight_grains, batch_code, notes, image_url, is_active, created_at, updated_at
		FROM pellets WHERE id = $1
	`, session.PelletID))
	if err == nil {
		session.Pellet = pellet
	}

	// Load groups
	groups, err := r.listGroups(ctx, session.ID)
	if err != nil {
		return nil, fmt.Errorf("load groups: %w", err)
	}
	session.Groups = groups

	// Load images
	images, err := r.listImages(ctx, session.ID)
	if err != nil {
		return nil, fmt.Errorf("load images: %w", err)
	}
	session.Images = images

	return session, nil
}

func (r *PelletTestRepository) ListByUser(ctx context.Context, userID string, limit, offset int) ([]*model.PelletTestSessionSummary, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.id, s.test_date, s.distance_m, s.distance_unit, s.location,
			s.average_group_size_mm, s.best_group_size_mm, s.group_count,
			ri.make, ri.model, p.brand, p.model, s.created_at
		FROM pellet_test_sessions s
		JOIN rifles ri ON ri.id = s.rifle_id
		JOIN pellets p ON p.id = s.pellet_id
		WHERE s.user_id = $1
		ORDER BY s.test_date DESC, s.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list pellet test sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*model.PelletTestSessionSummary
	for rows.Next() {
		var s model.PelletTestSessionSummary
		var testDate time.Time
		var createdAt time.Time
		if err := rows.Scan(
			&s.ID, &testDate, &s.DistanceM, &s.DistanceUnit, &s.Location,
			&s.AverageGroupSizeMM, &s.BestGroupSizeMM, &s.GroupCount,
			&s.RifleMake, &s.RifleModel, &s.PelletBrand, &s.PelletModel, &createdAt,
		); err != nil {
			return nil, fmt.Errorf("scan pellet test session: %w", err)
		}
		s.TestDate = testDate.Format("2006-01-02")
		s.CreatedAt = createdAt.Format(time.RFC3339)
		sessions = append(sessions, &s)
	}
	return sessions, rows.Err()
}

func (r *PelletTestRepository) Update(ctx context.Context, id, userID string, in *model.UpdatePelletTestSessionInput, distanceM *float64) (*model.PelletTestSession, error) {
	session, err := scanSession(r.db.QueryRow(ctx, `
		UPDATE pellet_test_sessions SET
			rifle_id      = COALESCE($3, rifle_id),
			pellet_id     = COALESCE($4, pellet_id),
			test_date     = COALESCE($5, test_date),
			distance_m    = COALESCE($6, distance_m),
			distance_unit = COALESCE($7, distance_unit),
			location      = COALESCE($8, location),
			wind_mph      = COALESCE($9, wind_mph),
			temp_celsius  = COALESCE($10, temp_celsius),
			humidity_pct  = COALESCE($11, humidity_pct),
			notes         = COALESCE($12, notes),
			velocity_fps            = COALESCE($13, velocity_fps),
			velocity_sd             = COALESCE($14, velocity_sd),
			extreme_spread_fps      = COALESCE($15, extreme_spread_fps),
			bench_setup             = COALESCE($16, bench_setup),
			scope_details           = COALESCE($17, scope_details),
			barometric_pressure_mbar = COALESCE($18, barometric_pressure_mbar),
			updated_at    = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+sessionCols+`
	`, id, userID, in.RifleID, in.PelletID, in.TestDate, distanceM, in.DistanceUnit,
		in.Location, in.WindMPH, in.TempCelsius, in.HumidityPct, in.Notes,
		in.VelocityFPS, in.VelocitySD, in.ExtremeSpreadFPS,
		in.BenchSetup, in.ScopeDetails, in.BarometricPressureMbar))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update pellet test session: %w", err)
	}
	return session, nil
}

func (r *PelletTestRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM pellet_test_sessions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete pellet test session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Groups ──────────────────────────────────────────────────────────────────────

func scanGroup(row pgx.Row) (*model.PelletTestGroup, error) {
	var g model.PelletTestGroup
	err := row.Scan(
		&g.ID, &g.SessionID, &g.GroupNumber, &g.ShotCount,
		&g.GroupSizeMM, &g.GroupSizeMOA, &g.Notes,
		&g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

const groupCols = `id, session_id, group_number, shot_count, group_size_mm, group_size_moa, notes, created_at, updated_at`

func (r *PelletTestRepository) listGroups(ctx context.Context, sessionID string) ([]*model.PelletTestGroup, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+groupCols+`
		FROM pellet_test_groups WHERE session_id = $1
		ORDER BY group_number
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*model.PelletTestGroup
	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

func (r *PelletTestRepository) CreateGroup(ctx context.Context, sessionID, userID string, in *model.CreatePelletTestGroupInput) (*model.PelletTestGroup, error) {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	group, err := scanGroup(r.db.QueryRow(ctx, `
		INSERT INTO pellet_test_groups (session_id, group_number, shot_count, group_size_mm, group_size_moa, notes)
		VALUES ($1, COALESCE((SELECT MAX(group_number) FROM pellet_test_groups WHERE session_id = $1), 0) + 1, $2, $3, $4, $5)
		RETURNING `+groupCols+`
	`, sessionID, in.ShotCount, in.GroupSizeMM, in.GroupSizeMOA, in.Notes))
	if err != nil {
		return nil, fmt.Errorf("create pellet test group: %w", err)
	}

	if err := r.updateSessionAggregates(ctx, sessionID); err != nil {
		return nil, err
	}

	return group, nil
}

func (r *PelletTestRepository) UpdateGroup(ctx context.Context, groupID, sessionID, userID string, in *model.UpdatePelletTestGroupInput) (*model.PelletTestGroup, error) {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	group, err := scanGroup(r.db.QueryRow(ctx, `
		UPDATE pellet_test_groups SET
			shot_count     = COALESCE($4, shot_count),
			group_size_mm  = COALESCE($5, group_size_mm),
			group_size_moa = COALESCE($6, group_size_moa),
			notes          = COALESCE($7, notes),
			updated_at     = NOW()
		WHERE id = $1 AND session_id = $2
		RETURNING `+groupCols+`
	`, groupID, sessionID, userID, in.ShotCount, in.GroupSizeMM, in.GroupSizeMOA, in.Notes))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update pellet test group: %w", err)
	}

	if err := r.updateSessionAggregates(ctx, sessionID); err != nil {
		return nil, err
	}

	return group, nil
}

func (r *PelletTestRepository) DeleteGroup(ctx context.Context, groupID, sessionID, userID string) error {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	tag, err := r.db.Exec(ctx, `DELETE FROM pellet_test_groups WHERE id = $1 AND session_id = $2`, groupID, sessionID)
	if err != nil {
		return fmt.Errorf("delete pellet test group: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return r.updateSessionAggregates(ctx, sessionID)
}

func (r *PelletTestRepository) updateSessionAggregates(ctx context.Context, sessionID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE pellet_test_sessions SET
			average_group_size_mm = (SELECT AVG(group_size_mm) FROM pellet_test_groups WHERE session_id = $1),
			best_group_size_mm    = (SELECT MIN(group_size_mm) FROM pellet_test_groups WHERE session_id = $1),
			group_count           = (SELECT COUNT(*)::int FROM pellet_test_groups WHERE session_id = $1),
			updated_at = NOW()
		WHERE id = $1
	`, sessionID)
	if err != nil {
		return fmt.Errorf("update session aggregates: %w", err)
	}
	return nil
}

// ── Images ──────────────────────────────────────────────────────────────────────

func (r *PelletTestRepository) listImages(ctx context.Context, sessionID string) ([]*model.PelletTestImage, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, session_id, group_id, image_id, '/api/v1/images/' || image_id::text AS image_url, caption, created_at
		FROM pellet_test_images WHERE session_id = $1
		ORDER BY created_at
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []*model.PelletTestImage
	for rows.Next() {
		var img model.PelletTestImage
		if err := rows.Scan(&img.ID, &img.SessionID, &img.GroupID, &img.ImageID, &img.ImageURL, &img.Caption, &img.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, &img)
	}
	return images, rows.Err()
}

func (r *PelletTestRepository) CreateImage(ctx context.Context, sessionID, userID, imageID string, groupID *string, caption *string) (*model.PelletTestImage, error) {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	var img model.PelletTestImage
	err = r.db.QueryRow(ctx, `
		INSERT INTO pellet_test_images (session_id, group_id, image_id, caption)
		VALUES ($1, $2, $3, $4)
		RETURNING id, session_id, group_id, image_id, '/api/v1/images/' || image_id::text, caption, created_at
	`, sessionID, groupID, imageID, caption).Scan(
		&img.ID, &img.SessionID, &img.GroupID, &img.ImageID, &img.ImageURL, &img.Caption, &img.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create pellet test image: %w", err)
	}
	return &img, nil
}

func (r *PelletTestRepository) DeleteImage(ctx context.Context, imageID, sessionID, userID string) error {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	tag, err := r.db.Exec(ctx, `DELETE FROM pellet_test_images WHERE id = $1 AND session_id = $2`, imageID, sessionID)
	if err != nil {
		return fmt.Errorf("delete pellet test image: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────

func (r *PelletTestRepository) GetLeaderboard(ctx context.Context, userID, rifleID string) ([]*model.PelletLeaderboardEntry, error) {
	rows, err := r.db.Query(ctx, `
		WITH ranked AS (
			SELECT
				s.pellet_id,
				p.brand  AS pellet_brand,
				p.model  AS pellet_model,
				p.head_size_mm,
				p.weight_grains,
				MIN(s.best_group_size_mm)          AS best_group_mm,
				AVG(s.average_group_size_mm)        AS avg_group_mm,
				COUNT(DISTINCT s.id)::int           AS test_count,
				SUM(s.group_count)::int             AS total_groups,
				STDDEV_POP(s.average_group_size_mm) AS consistency_score,
				MAX(s.test_date)::text              AS last_tested
			FROM pellet_test_sessions s
			JOIN pellets p ON p.id = s.pellet_id
			WHERE s.user_id = $1
			  AND s.rifle_id = $2
			  AND s.group_count > 0
			GROUP BY s.pellet_id, p.brand, p.model, p.head_size_mm, p.weight_grains
		)
		SELECT pellet_id, pellet_brand, pellet_model, head_size_mm, weight_grains,
			best_group_mm, avg_group_mm, test_count, total_groups, consistency_score,
			last_tested,
			ROW_NUMBER() OVER (ORDER BY best_group_mm ASC, avg_group_mm ASC, test_count DESC)::int AS rank
		FROM ranked
		ORDER BY rank
	`, userID, rifleID)
	if err != nil {
		return nil, fmt.Errorf("get leaderboard: %w", err)
	}
	defer rows.Close()

	var entries []*model.PelletLeaderboardEntry
	for rows.Next() {
		var e model.PelletLeaderboardEntry
		if err := rows.Scan(
			&e.PelletID, &e.PelletBrand, &e.PelletModel, &e.HeadSizeMM, &e.WeightGrains,
			&e.BestGroupMM, &e.AvgGroupMM, &e.TestCount, &e.TotalGroups, &e.ConsistencyScore,
			&e.LastTested, &e.Rank,
		); err != nil {
			return nil, fmt.Errorf("scan leaderboard entry: %w", err)
		}
		entries = append(entries, &e)
	}
	return entries, rows.Err()
}

// ── Stats ───────────────────────────────────────────────────────────────────────

func (r *PelletTestRepository) GetStats(ctx context.Context, userID string) (*model.PelletTestStats, error) {
	var stats model.PelletTestStats
	err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT s.id)::int,
			COALESCE(SUM(s.group_count), 0)::int,
			MIN(s.best_group_size_mm),
			AVG(s.average_group_size_mm)
		FROM pellet_test_sessions s
		WHERE s.user_id = $1
	`, userID).Scan(&stats.TotalTests, &stats.TotalGroups, &stats.BestGroupMM, &stats.AvgGroupMM)
	if err != nil {
		return nil, fmt.Errorf("get pellet test stats: %w", err)
	}

	// Most tested pellet
	err = r.db.QueryRow(ctx, `
		SELECT p.brand || ' ' || p.model
		FROM pellet_test_sessions s
		JOIN pellets p ON p.id = s.pellet_id
		WHERE s.user_id = $1
		GROUP BY s.pellet_id, p.brand, p.model
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`, userID).Scan(&stats.MostTestedPellet)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get most tested pellet: %w", err)
	}

	return &stats, nil
}

// ── Measurements ────────────────────────────────────────────────────────────────

const measurementCols = `id, image_id, session_id, group_id,
	calibration_type, target_preset, reference_ring_name,
	reference_diameter_mm, reference_pixels, pixels_per_mm,
	ref_center_x, ref_center_y, ref_radius_pixels,
	bbox_x, bbox_y, bbox_width, bbox_height,
	measured_size_mm, measured_size_moa,
	created_at, updated_at`

func scanMeasurement(row pgx.Row) (*model.PelletTestMeasurement, error) {
	var m model.PelletTestMeasurement
	err := row.Scan(
		&m.ID, &m.ImageID, &m.SessionID, &m.GroupID,
		&m.CalibrationType, &m.TargetPreset, &m.ReferenceRingName,
		&m.ReferenceDiameterMM, &m.ReferencePixels, &m.PixelsPerMM,
		&m.RefCenterX, &m.RefCenterY, &m.RefRadiusPixels,
		&m.BboxX, &m.BboxY, &m.BboxWidth, &m.BboxHeight,
		&m.MeasuredSizeMM, &m.MeasuredSizeMOA,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PelletTestRepository) CreateMeasurement(ctx context.Context, sessionID, userID, imageID string, in *model.CreatePelletTestMeasurementInput) (*model.PelletTestMeasurement, error) {
	// Verify session ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	// Verify image belongs to session
	err = r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_images WHERE id = $1 AND session_id = $2)`, imageID, sessionID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify image: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	m, err := scanMeasurement(r.db.QueryRow(ctx, `
		INSERT INTO pellet_test_measurements (image_id, session_id, group_id,
			calibration_type, target_preset, reference_ring_name,
			reference_diameter_mm, reference_pixels, pixels_per_mm,
			ref_center_x, ref_center_y, ref_radius_pixels,
			bbox_x, bbox_y, bbox_width, bbox_height,
			measured_size_mm, measured_size_moa)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		RETURNING `+measurementCols+`
	`, imageID, sessionID, in.GroupID,
		in.CalibrationType, in.TargetPreset, in.ReferenceRingName,
		in.ReferenceDiameterMM, in.ReferencePixels, in.PixelsPerMM,
		in.RefCenterX, in.RefCenterY, in.RefRadiusPixels,
		in.BboxX, in.BboxY, in.BboxWidth, in.BboxHeight,
		in.MeasuredSizeMM, in.MeasuredSizeMOA))
	if err != nil {
		return nil, fmt.Errorf("create measurement: %w", err)
	}
	return m, nil
}

func (r *PelletTestRepository) GetMeasurementsByImage(ctx context.Context, sessionID, imageID string) ([]*model.PelletTestMeasurement, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+measurementCols+`
		FROM pellet_test_measurements
		WHERE session_id = $1 AND image_id = $2
		ORDER BY created_at
	`, sessionID, imageID)
	if err != nil {
		return nil, fmt.Errorf("list measurements: %w", err)
	}
	defer rows.Close()

	var measurements []*model.PelletTestMeasurement
	for rows.Next() {
		m, err := scanMeasurement(rows)
		if err != nil {
			return nil, fmt.Errorf("scan measurement: %w", err)
		}
		measurements = append(measurements, m)
	}
	return measurements, rows.Err()
}

func (r *PelletTestRepository) UpdateMeasurement(ctx context.Context, measurementID, sessionID, userID string, in *model.UpdatePelletTestMeasurementInput) (*model.PelletTestMeasurement, error) {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	m, err := scanMeasurement(r.db.QueryRow(ctx, `
		UPDATE pellet_test_measurements SET
			group_id         = COALESCE($4, group_id),
			bbox_x           = COALESCE($5, bbox_x),
			bbox_y           = COALESCE($6, bbox_y),
			bbox_width       = COALESCE($7, bbox_width),
			bbox_height      = COALESCE($8, bbox_height),
			measured_size_mm  = COALESCE($9, measured_size_mm),
			measured_size_moa = COALESCE($10, measured_size_moa),
			updated_at       = NOW()
		WHERE id = $1 AND session_id = $2
		RETURNING `+measurementCols+`
	`, measurementID, sessionID, userID,
		in.GroupID, in.BboxX, in.BboxY, in.BboxWidth, in.BboxHeight,
		in.MeasuredSizeMM, in.MeasuredSizeMOA))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update measurement: %w", err)
	}
	return m, nil
}

func (r *PelletTestRepository) DeleteMeasurement(ctx context.Context, measurementID, sessionID, userID string) error {
	// Verify ownership
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pellet_test_sessions WHERE id = $1 AND user_id = $2)`, sessionID, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("verify session: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	tag, err := r.db.Exec(ctx, `DELETE FROM pellet_test_measurements WHERE id = $1 AND session_id = $2`, measurementID, sessionID)
	if err != nil {
		return fmt.Errorf("delete measurement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Comparison ──────────────────────────────────────────────────────────────────

func (r *PelletTestRepository) GetComparisonSide(ctx context.Context, userID, rifleID, pelletID string) (*model.PelletComparisonSide, error) {
	var side model.PelletComparisonSide
	err := r.db.QueryRow(ctx, `
		SELECT
			s.pellet_id,
			p.brand,
			p.model,
			COUNT(DISTINCT s.id)::int AS test_count,
			COALESCE(SUM(s.group_count), 0)::int AS total_groups,
			MIN(s.best_group_size_mm),
			AVG(s.average_group_size_mm),
			AVG(s.velocity_fps),
			AVG(s.velocity_sd),
			STDDEV_POP(s.average_group_size_mm)
		FROM pellet_test_sessions s
		JOIN pellets p ON p.id = s.pellet_id
		WHERE s.user_id = $1 AND s.rifle_id = $2 AND s.pellet_id = $3 AND s.group_count > 0
		GROUP BY s.pellet_id, p.brand, p.model
	`, userID, rifleID, pelletID).Scan(
		&side.PelletID, &side.PelletBrand, &side.PelletModel,
		&side.TestCount, &side.TotalGroups,
		&side.BestGroupMM, &side.AvgGroupMM,
		&side.AvgVelocity, &side.AvgSD, &side.Consistency,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get comparison side: %w", err)
	}

	// Load all groups for this pellet+rifle combo
	rows, err := r.db.Query(ctx, `
		SELECT g.id, g.session_id, g.group_number, g.shot_count, g.group_size_mm, g.group_size_moa, g.notes, g.created_at, g.updated_at
		FROM pellet_test_groups g
		JOIN pellet_test_sessions s ON s.id = g.session_id
		WHERE s.user_id = $1 AND s.rifle_id = $2 AND s.pellet_id = $3
		ORDER BY s.test_date DESC, g.group_number
	`, userID, rifleID, pelletID)
	if err != nil {
		return nil, fmt.Errorf("get comparison groups: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, fmt.Errorf("scan comparison group: %w", err)
		}
		side.Groups = append(side.Groups, g)
	}
	if side.Groups == nil {
		side.Groups = []*model.PelletTestGroup{}
	}
	return &side, rows.Err()
}

// ── Timeline ────────────────────────────────────────────────────────────────────

func (r *PelletTestRepository) GetGroupTimeline(ctx context.Context, userID, rifleID string) ([]*model.GroupTimelinePoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			s.test_date::text,
			s.pellet_id,
			p.brand,
			p.model,
			g.group_size_mm,
			g.group_size_moa,
			s.distance_m
		FROM pellet_test_groups g
		JOIN pellet_test_sessions s ON s.id = g.session_id
		JOIN pellets p ON p.id = s.pellet_id
		WHERE s.user_id = $1 AND s.rifle_id = $2
		ORDER BY s.test_date, g.group_number
	`, userID, rifleID)
	if err != nil {
		return nil, fmt.Errorf("get group timeline: %w", err)
	}
	defer rows.Close()

	var points []*model.GroupTimelinePoint
	for rows.Next() {
		var pt model.GroupTimelinePoint
		if err := rows.Scan(
			&pt.TestDate, &pt.PelletID, &pt.PelletBrand, &pt.PelletModel,
			&pt.GroupSizeMM, &pt.GroupSizeMOA, &pt.DistanceM,
		); err != nil {
			return nil, fmt.Errorf("scan timeline point: %w", err)
		}
		points = append(points, &pt)
	}
	if points == nil {
		points = []*model.GroupTimelinePoint{}
	}
	return points, rows.Err()
}
