package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// GearShowcaseRepository backs the gear detail pages: one owner's record with
// a single rifle or pellet, plus the anonymised cross-user comparison for that
// make/model.
//
// Two rules hold for every community query in this file:
//
//   - Contribution requires consent. Only gear rows with comparison_opt_in and
//     owners whose profile_visibility is not 'private' are aggregated.
//   - Contribution requires a completed record. Drafts never count.
//
// Gear is stored per-user, so "the same rifle" across accounts is matched on a
// normalised (make, model) pair — the same key the idx_*_model_key indexes are
// built on.
type GearShowcaseRepository struct {
	db *pgxpool.Pool
}

func NewGearShowcaseRepository(db *pgxpool.Pool) *GearShowcaseRepository {
	return &GearShowcaseRepository{db: db}
}

// scoreBins are the fixed buckets of the 250-point score histogram. Shared by
// the personal and community distributions so the two overlay cleanly.
var scoreBins = []struct {
	label    string
	min, max int
}{
	{"<180", 0, 179},
	{"180-199", 180, 199},
	{"200-214", 200, 214},
	{"215-224", 215, 224},
	{"225-234", 225, 234},
	{"235-244", 235, 244},
	{"245-250", 245, 250},
}

// groupBins are the fixed buckets (in tenths of a mm) of the group-size
// histogram. Stored as ints so they share GearHistogramBin with scores.
var groupBins = []struct {
	label    string
	min, max int
}{
	{"<10mm", 0, 99},
	{"10-15mm", 100, 149},
	{"15-20mm", 150, 199},
	{"20-25mm", 200, 249},
	{"25-30mm", 250, 299},
	{"30mm+", 300, 1 << 30},
}

// simExclusion is the fragment that drops simulated accounts from community
// aggregates when the admin has turned include_in_public_stats off. The alias
// is the table holding user_id.
func simExclusion(alias string, exclude bool) string {
	if !exclude {
		return ""
	}
	return fmt.Sprintf(" AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id = %s.user_id AND su.is_simulated)", alias)
}

// ── Personal: rifle ─────────────────────────────────────────────────────────

// GetRiflePersonal returns the owner's aggregate record with one rifle,
// combining score-card totals with pellet-test group figures.
func (r *GearShowcaseRepository) GetRiflePersonal(ctx context.Context, rifleID, userID string) (*model.GearPersonalStats, error) {
	var s model.GearPersonalStats
	err := r.db.QueryRow(ctx, `
		WITH cards AS (
			SELECT * FROM score_cards
			WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE
		)
		SELECT
			(SELECT COUNT(*)::int FROM cards),
			(SELECT COALESCE(SUM(COALESCE(ARRAY_LENGTH(shot_scores, 1), 0)), 0)::int FROM cards),
			(SELECT MAX(total_score)::int FROM cards),
			(SELECT MAX(x_count)::int FROM cards),
			(SELECT id::text FROM cards ORDER BY total_score DESC, x_count DESC, shot_at DESC LIMIT 1),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(AVG(x_count)::numeric, 2) FROM cards),
			(SELECT ROUND(COALESCE(STDDEV_POP(total_score), 0)::numeric, 2) FROM cards),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM
				(SELECT total_score FROM cards ORDER BY shot_at DESC, created_at DESC LIMIT 10) recent),
			(SELECT MIN(shot_at)::text FROM cards),
			(SELECT MAX(shot_at)::text FROM cards),
			(SELECT COUNT(DISTINCT shot_at)::int FROM cards),
			(SELECT COALESCE(SUM((SELECT COUNT(*) FROM UNNEST(shot_scores) v WHERE v = 10)), 0)::int FROM cards),
			(SELECT COUNT(*)::int FROM pellet_test_sessions
			  WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE),
			(SELECT COALESCE(SUM(group_count), 0)::int FROM pellet_test_sessions
			  WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE),
			(SELECT ROUND(MIN(best_group_size_mm)::numeric, 2) FROM pellet_test_sessions
			  WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0),
			(SELECT ROUND(AVG(average_group_size_mm)::numeric, 2) FROM pellet_test_sessions
			  WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0)
	`, rifleID, userID).Scan(
		&s.CardCount, &s.ShotsFired, &s.BestScore, &s.BestXCount, &s.BestCardID,
		&s.AvgScore, &s.AvgXCount, &s.StdDev, &s.Rolling10Avg,
		&s.FirstUsed, &s.LastUsed, &s.ActiveDays, &s.PerfectShots,
		&s.TestCount, &s.GroupCount, &s.BestGroupMM, &s.AvgGroupMM,
	)
	if err != nil {
		return nil, fmt.Errorf("get rifle personal stats: %w", err)
	}
	s.XPercentage = xPercentage(s.AvgXCount)
	return &s, nil
}

// GetPelletPersonal mirrors GetRiflePersonal for a pellet.
func (r *GearShowcaseRepository) GetPelletPersonal(ctx context.Context, pelletID, userID string) (*model.GearPersonalStats, error) {
	var s model.GearPersonalStats
	err := r.db.QueryRow(ctx, `
		WITH cards AS (
			SELECT * FROM score_cards
			WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE
		)
		SELECT
			(SELECT COUNT(*)::int FROM cards),
			(SELECT COALESCE(SUM(COALESCE(ARRAY_LENGTH(shot_scores, 1), 0)), 0)::int FROM cards),
			(SELECT MAX(total_score)::int FROM cards),
			(SELECT MAX(x_count)::int FROM cards),
			(SELECT id::text FROM cards ORDER BY total_score DESC, x_count DESC, shot_at DESC LIMIT 1),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(AVG(x_count)::numeric, 2) FROM cards),
			(SELECT ROUND(COALESCE(STDDEV_POP(total_score), 0)::numeric, 2) FROM cards),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM
				(SELECT total_score FROM cards ORDER BY shot_at DESC, created_at DESC LIMIT 10) recent),
			(SELECT MIN(shot_at)::text FROM cards),
			(SELECT MAX(shot_at)::text FROM cards),
			(SELECT COUNT(DISTINCT shot_at)::int FROM cards),
			(SELECT COALESCE(SUM((SELECT COUNT(*) FROM UNNEST(shot_scores) v WHERE v = 10)), 0)::int FROM cards),
			(SELECT COUNT(*)::int FROM pellet_test_sessions
			  WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE),
			(SELECT COALESCE(SUM(group_count), 0)::int FROM pellet_test_sessions
			  WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE),
			(SELECT ROUND(MIN(best_group_size_mm)::numeric, 2) FROM pellet_test_sessions
			  WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0),
			(SELECT ROUND(AVG(average_group_size_mm)::numeric, 2) FROM pellet_test_sessions
			  WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0)
	`, pelletID, userID).Scan(
		&s.CardCount, &s.ShotsFired, &s.BestScore, &s.BestXCount, &s.BestCardID,
		&s.AvgScore, &s.AvgXCount, &s.StdDev, &s.Rolling10Avg,
		&s.FirstUsed, &s.LastUsed, &s.ActiveDays, &s.PerfectShots,
		&s.TestCount, &s.GroupCount, &s.BestGroupMM, &s.AvgGroupMM,
	)
	if err != nil {
		return nil, fmt.Errorf("get pellet personal stats: %w", err)
	}
	s.XPercentage = xPercentage(s.AvgXCount)
	return &s, nil
}

// xPercentage converts an average X-count per 25-shot card into a percentage.
func xPercentage(avgX *float64) *float64 {
	if avgX == nil {
		return nil
	}
	pct := (*avgX / 25) * 100
	rounded := float64(int(pct*100+0.5)) / 100
	return &rounded
}

// ── Personal: charts ────────────────────────────────────────────────────────

// GetScoreTrend buckets the owner's cards for one gear item by month.
// column must be "rifle_id" or "pellet_id" — callers pass a literal.
func (r *GearShowcaseRepository) GetScoreTrend(ctx context.Context, column, gearID, userID string) ([]model.GearTrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			DATE_TRUNC('month', shot_at)::date::text,
			ROUND(AVG(total_score)::numeric, 2)::float8,
			MAX(total_score)::int,
			ROUND(AVG(x_count)::numeric, 2)::float8,
			ROUND(COALESCE(STDDEV_POP(total_score), 0)::numeric, 2)::float8,
			COUNT(*)::int
		FROM score_cards
		WHERE `+gearColumn(column)+` = $1 AND user_id = $2 AND is_draft = FALSE
		GROUP BY DATE_TRUNC('month', shot_at)
		ORDER BY 1
	`, gearID, userID)
	if err != nil {
		return nil, fmt.Errorf("get gear score trend: %w", err)
	}
	defer rows.Close()

	points := []model.GearTrendPoint{}
	for rows.Next() {
		var p model.GearTrendPoint
		if err := rows.Scan(&p.Period, &p.AvgScore, &p.BestScore, &p.AvgXCount, &p.StdDev, &p.CardCount); err != nil {
			return nil, fmt.Errorf("scan gear trend: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetScoreDistribution buckets the owner's card totals into scoreBins.
func (r *GearShowcaseRepository) GetScoreDistribution(ctx context.Context, column, gearID, userID string) ([]model.GearHistogramBin, error) {
	rows, err := r.db.Query(ctx, `
		SELECT total_score::int, COUNT(*)::int
		FROM score_cards
		WHERE `+gearColumn(column)+` = $1 AND user_id = $2 AND is_draft = FALSE
		GROUP BY total_score
	`, gearID, userID)
	if err != nil {
		return nil, fmt.Errorf("get gear score distribution: %w", err)
	}
	defer rows.Close()

	bins := newScoreBins()
	for rows.Next() {
		var score, count int
		if err := rows.Scan(&score, &count); err != nil {
			return nil, fmt.Errorf("scan gear score distribution: %w", err)
		}
		addToBins(bins, score, count)
	}
	return bins, rows.Err()
}

// GetShotBreakdown counts how often each shot value 0-10 was scored with this
// gear. Unnests the per-card shot arrays.
func (r *GearShowcaseRepository) GetShotBreakdown(ctx context.Context, column, gearID, userID string) ([]model.GearShotBucket, error) {
	rows, err := r.db.Query(ctx, `
		SELECT v::int, COUNT(*)::int
		FROM score_cards, UNNEST(shot_scores) v
		WHERE `+gearColumn(column)+` = $1 AND user_id = $2 AND is_draft = FALSE
		GROUP BY v
		ORDER BY v
	`, gearID, userID)
	if err != nil {
		return nil, fmt.Errorf("get gear shot breakdown: %w", err)
	}
	defer rows.Close()

	counts := map[int]int{}
	for rows.Next() {
		var value, count int
		if err := rows.Scan(&value, &count); err != nil {
			return nil, fmt.Errorf("scan gear shot breakdown: %w", err)
		}
		counts[value] = count
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	buckets := make([]model.GearShotBucket, 0, 11)
	for v := 0; v <= 10; v++ {
		buckets = append(buckets, model.GearShotBucket{Value: v, Count: counts[v]})
	}
	return buckets, nil
}

// GetGroupTrend buckets the owner's pellet-test group sizes for one gear item
// by month.
func (r *GearShowcaseRepository) GetGroupTrend(ctx context.Context, column, gearID, userID string) ([]model.GearGroupPoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			DATE_TRUNC('month', test_date)::date::text,
			ROUND(AVG(average_group_size_mm)::numeric, 2)::float8,
			ROUND(MIN(best_group_size_mm)::numeric, 2)::float8,
			COUNT(*)::int
		FROM pellet_test_sessions
		WHERE `+gearColumn(column)+` = $1 AND user_id = $2
		  AND is_draft = FALSE AND group_count > 0
		GROUP BY DATE_TRUNC('month', test_date)
		ORDER BY 1
	`, gearID, userID)
	if err != nil {
		return nil, fmt.Errorf("get gear group trend: %w", err)
	}
	defer rows.Close()

	points := []model.GearGroupPoint{}
	for rows.Next() {
		var p model.GearGroupPoint
		if err := rows.Scan(&p.Period, &p.AvgGroupMM, &p.BestGroupMM, &p.TestCount); err != nil {
			return nil, fmt.Errorf("scan gear group trend: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetGroupDistribution buckets the owner's per-group measurements for one gear
// item into groupBins.
func (r *GearShowcaseRepository) GetGroupDistribution(ctx context.Context, column, gearID, userID string) ([]model.GearHistogramBin, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ROUND(g.group_size_mm * 10)::int, COUNT(*)::int
		FROM pellet_test_groups g
		JOIN pellet_test_sessions s ON s.id = g.session_id
		WHERE s.`+gearColumn(column)+` = $1 AND s.user_id = $2 AND s.is_draft = FALSE
		GROUP BY 1
	`, gearID, userID)
	if err != nil {
		return nil, fmt.Errorf("get gear group distribution: %w", err)
	}
	defer rows.Close()

	bins := newGroupBins()
	for rows.Next() {
		var tenths, count int
		if err := rows.Scan(&tenths, &count); err != nil {
			return nil, fmt.Errorf("scan gear group distribution: %w", err)
		}
		addToBins(bins, tenths, count)
	}
	return bins, rows.Err()
}

// GetRiflePairings lists the pellets the owner has paired with this rifle,
// ranked by usage, with the score and group figures for each pairing.
func (r *GearShowcaseRepository) GetRiflePairings(ctx context.Context, rifleID, userID string, limit int) ([]model.GearPairing, error) {
	rows, err := r.db.Query(ctx, `
		WITH card_side AS (
			SELECT pellet_id, COUNT(*)::int AS card_count,
			       ROUND(AVG(total_score)::numeric, 2)::float8 AS avg_score,
			       MAX(total_score)::int AS best_score
			FROM score_cards
			WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE AND pellet_id IS NOT NULL
			GROUP BY pellet_id
		),
		test_side AS (
			SELECT pellet_id, COUNT(*)::int AS test_count,
			       ROUND(AVG(average_group_size_mm)::numeric, 2)::float8 AS avg_group,
			       ROUND(MIN(best_group_size_mm)::numeric, 2)::float8 AS best_group
			FROM pellet_test_sessions
			WHERE rifle_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0
			GROUP BY pellet_id
		)
		SELECT p.id::text, p.brand || ' ' || p.model,
		       COALESCE(c.card_count, 0), c.avg_score, c.best_score,
		       COALESCE(t.test_count, 0), t.avg_group, t.best_group
		FROM pellets p
		LEFT JOIN card_side c ON c.pellet_id = p.id
		LEFT JOIN test_side t ON t.pellet_id = p.id
		WHERE c.pellet_id IS NOT NULL OR t.pellet_id IS NOT NULL
		ORDER BY COALESCE(c.card_count, 0) + COALESCE(t.test_count, 0) DESC, p.brand, p.model
		LIMIT $3
	`, rifleID, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("get rifle pairings: %w", err)
	}
	return scanPairings(rows)
}

// GetPelletPairings is the mirror of GetRiflePairings, keyed on the pellet.
func (r *GearShowcaseRepository) GetPelletPairings(ctx context.Context, pelletID, userID string, limit int) ([]model.GearPairing, error) {
	rows, err := r.db.Query(ctx, `
		WITH card_side AS (
			SELECT rifle_id, COUNT(*)::int AS card_count,
			       ROUND(AVG(total_score)::numeric, 2)::float8 AS avg_score,
			       MAX(total_score)::int AS best_score
			FROM score_cards
			WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE AND rifle_id IS NOT NULL
			GROUP BY rifle_id
		),
		test_side AS (
			SELECT rifle_id, COUNT(*)::int AS test_count,
			       ROUND(AVG(average_group_size_mm)::numeric, 2)::float8 AS avg_group,
			       ROUND(MIN(best_group_size_mm)::numeric, 2)::float8 AS best_group
			FROM pellet_test_sessions
			WHERE pellet_id = $1 AND user_id = $2 AND is_draft = FALSE AND group_count > 0
			GROUP BY rifle_id
		)
		SELECT rf.id::text, rf.make || ' ' || rf.model,
		       COALESCE(c.card_count, 0), c.avg_score, c.best_score,
		       COALESCE(t.test_count, 0), t.avg_group, t.best_group
		FROM rifles rf
		LEFT JOIN card_side c ON c.rifle_id = rf.id
		LEFT JOIN test_side t ON t.rifle_id = rf.id
		WHERE c.rifle_id IS NOT NULL OR t.rifle_id IS NOT NULL
		ORDER BY COALESCE(c.card_count, 0) + COALESCE(t.test_count, 0) DESC, rf.make, rf.model
		LIMIT $3
	`, pelletID, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("get pellet pairings: %w", err)
	}
	return scanPairings(rows)
}

// GetRecentCards lists the owner's latest completed cards with this gear.
func (r *GearShowcaseRepository) GetRecentCards(ctx context.Context, column, gearID, userID string, limit int) ([]model.GearRecentCard, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text, shot_at::text, total_score::int, x_count::int, COALESCE(location, '')
		FROM score_cards
		WHERE `+gearColumn(column)+` = $1 AND user_id = $2 AND is_draft = FALSE
		ORDER BY shot_at DESC, created_at DESC
		LIMIT $3
	`, gearID, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("get gear recent cards: %w", err)
	}
	defer rows.Close()

	cards := []model.GearRecentCard{}
	for rows.Next() {
		var c model.GearRecentCard
		if err := rows.Scan(&c.ID, &c.ShotAt, &c.TotalScore, &c.XCount, &c.Location); err != nil {
			return nil, fmt.Errorf("scan gear recent card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

// ── Community: rifle ────────────────────────────────────────────────────────

// GetRifleCommunity aggregates every opted-in owner of the same rifle
// make/model. Returns Eligible=false (and no figures) below the k-anonymity
// floor. viewerID is excluded from nothing — the viewer is part of the
// community — but is flagged in the leaderboard and used for the percentile.
func (r *GearShowcaseRepository) GetRifleCommunity(ctx context.Context, make, modelName, viewerID string, excludeSimulated bool) (*model.GearCommunity, error) {
	c := &model.GearCommunity{MinOwners: model.GearMinComparisonOwners, OptedIn: true}
	c.Distribution = newScoreBins()
	c.Trend = []model.GearTrendPoint{}
	c.TopPairings = []model.GearPairing{}
	c.Leaders = []model.GearLeader{}
	c.GroupLeaders = []model.GearGroupLeader{}

	sim := simExclusion("sc", excludeSimulated)
	simTests := simExclusion("pts", excludeSimulated)
	base := `
		WITH gear AS (
			SELECT rf.id, rf.user_id
			FROM rifles rf
			JOIN users u ON u.id = rf.user_id
			WHERE LOWER(BTRIM(rf.make)) = LOWER(BTRIM($1))
			  AND LOWER(BTRIM(rf.model)) = LOWER(BTRIM($2))
			  AND rf.comparison_opt_in
			  AND u.profile_visibility <> 'private'
		),
		cards AS (
			SELECT sc.user_id, sc.total_score, sc.x_count, sc.shot_at
			FROM score_cards sc
			JOIN gear g ON g.id = sc.rifle_id
			WHERE sc.is_draft = FALSE` + sim + `
		),
		per_owner AS (
			SELECT user_id, AVG(total_score) AS avg_score, COUNT(*) AS card_count
			FROM cards GROUP BY user_id
		)`

	err := r.db.QueryRow(ctx, base+`
		SELECT
			(SELECT COUNT(*)::int FROM per_owner),
			(SELECT COUNT(*)::int FROM cards),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_score)::numeric, 2) FROM cards),
			(SELECT MAX(total_score)::int FROM cards),
			(SELECT ROUND(AVG(x_count)::numeric, 2) FROM cards),
			(SELECT COUNT(*)::int FROM pellet_test_sessions pts
			  JOIN gear g ON g.id = pts.rifle_id
			  WHERE pts.is_draft = FALSE AND pts.group_count > 0`+simTests+`)
	`, make, modelName).Scan(
		&c.OwnerCount, &c.CardCount, &c.AvgScore, &c.MedianScore, &c.P90Score,
		&c.BestScore, &c.AvgXCount, &c.TestCount,
	)
	if err != nil {
		return nil, fmt.Errorf("get rifle community summary: %w", err)
	}

	if c.OwnerCount < model.GearMinComparisonOwners {
		return blankCommunity(c), nil
	}
	c.Eligible = true

	// Viewer's standing among per-owner averages.
	if err := r.db.QueryRow(ctx, base+`
		, ranked AS (
			SELECT user_id, RANK() OVER (ORDER BY avg_score DESC) AS rnk,
			       PERCENT_RANK() OVER (ORDER BY avg_score ASC) AS pct
			FROM per_owner
		)
		SELECT rnk::int, ROUND((pct * 100)::numeric, 1)
		FROM ranked WHERE user_id = $3::uuid
	`, make, modelName, viewerID).Scan(&c.YourRank, &c.YourPercentile); err != nil {
		// The viewer may have no completed cards with this rifle yet, or may
		// have opted out — neither is an error, they just have no standing.
		c.YourRank, c.YourPercentile = nil, nil
	}

	dist, err := r.communityScoreDistribution(ctx, base, make, modelName)
	if err != nil {
		return nil, err
	}
	c.Distribution = dist

	trend, err := r.communityScoreTrend(ctx, base, make, modelName)
	if err != nil {
		return nil, err
	}
	c.Trend = trend

	leaders, err := r.rifleLeaders(ctx, make, modelName, viewerID, excludeSimulated)
	if err != nil {
		return nil, err
	}
	c.Leaders = leaders

	pairings, err := r.rifleCommunityPairings(ctx, make, modelName, excludeSimulated)
	if err != nil {
		return nil, err
	}
	c.TopPairings = pairings

	return c, nil
}

// GetPelletCommunity is the pellet mirror of GetRifleCommunity, adding the
// group-size figures that are the real currency of pellet comparison.
func (r *GearShowcaseRepository) GetPelletCommunity(ctx context.Context, brand, modelName, viewerID string, excludeSimulated bool) (*model.GearCommunity, error) {
	c := &model.GearCommunity{MinOwners: model.GearMinComparisonOwners, OptedIn: true}
	c.Distribution = newScoreBins()
	c.Trend = []model.GearTrendPoint{}
	c.TopPairings = []model.GearPairing{}
	c.Leaders = []model.GearLeader{}
	c.GroupLeaders = []model.GearGroupLeader{}

	sim := simExclusion("sc", excludeSimulated)
	base := `
		WITH gear AS (
			SELECT p.id, p.user_id
			FROM pellets p
			JOIN users u ON u.id = p.user_id
			WHERE LOWER(BTRIM(p.brand)) = LOWER(BTRIM($1))
			  AND LOWER(BTRIM(p.model)) = LOWER(BTRIM($2))
			  AND p.comparison_opt_in
			  AND u.profile_visibility <> 'private'
		),
		cards AS (
			SELECT sc.user_id, sc.total_score, sc.x_count, sc.shot_at
			FROM score_cards sc
			JOIN gear g ON g.id = sc.pellet_id
			WHERE sc.is_draft = FALSE` + sim + `
		),
		per_owner AS (
			SELECT user_id, AVG(total_score) AS avg_score, COUNT(*) AS card_count
			FROM cards GROUP BY user_id
		)`

	simTests := simExclusion("pts", excludeSimulated)
	err := r.db.QueryRow(ctx, base+`
		, tests AS (
			SELECT pts.user_id, pts.average_group_size_mm, pts.best_group_size_mm
			FROM pellet_test_sessions pts
			JOIN gear g ON g.id = pts.pellet_id
			WHERE pts.is_draft = FALSE AND pts.group_count > 0`+simTests+`
		)
		SELECT
			(SELECT COUNT(*)::int FROM (
				SELECT user_id FROM per_owner UNION SELECT user_id FROM tests
			) owners),
			(SELECT COUNT(*)::int FROM cards),
			(SELECT ROUND(AVG(total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_score)::numeric, 2) FROM cards),
			(SELECT ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_score)::numeric, 2) FROM cards),
			(SELECT MAX(total_score)::int FROM cards),
			(SELECT ROUND(AVG(x_count)::numeric, 2) FROM cards),
			(SELECT COUNT(*)::int FROM tests),
			(SELECT ROUND(AVG(average_group_size_mm)::numeric, 2) FROM tests),
			(SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY average_group_size_mm)::numeric, 2) FROM tests),
			(SELECT ROUND(MIN(best_group_size_mm)::numeric, 2) FROM tests)
	`, brand, modelName).Scan(
		&c.OwnerCount, &c.CardCount, &c.AvgScore, &c.MedianScore, &c.P90Score,
		&c.BestScore, &c.AvgXCount, &c.TestCount,
		&c.AvgGroupMM, &c.MedianGroupMM, &c.BestGroupMM,
	)
	if err != nil {
		return nil, fmt.Errorf("get pellet community summary: %w", err)
	}

	if c.OwnerCount < model.GearMinComparisonOwners {
		return blankCommunity(c), nil
	}
	c.Eligible = true

	if err := r.db.QueryRow(ctx, base+`
		, ranked AS (
			SELECT user_id, RANK() OVER (ORDER BY avg_score DESC) AS rnk,
			       PERCENT_RANK() OVER (ORDER BY avg_score ASC) AS pct
			FROM per_owner
		)
		SELECT rnk::int, ROUND((pct * 100)::numeric, 1)
		FROM ranked WHERE user_id = $3::uuid
	`, brand, modelName, viewerID).Scan(&c.YourRank, &c.YourPercentile); err != nil {
		c.YourRank, c.YourPercentile = nil, nil
	}

	dist, err := r.communityScoreDistribution(ctx, base, brand, modelName)
	if err != nil {
		return nil, err
	}
	c.Distribution = dist

	trend, err := r.communityScoreTrend(ctx, base, brand, modelName)
	if err != nil {
		return nil, err
	}
	c.Trend = trend

	groupLeaders, err := r.pelletGroupLeaders(ctx, brand, modelName, viewerID, excludeSimulated)
	if err != nil {
		return nil, err
	}
	c.GroupLeaders = groupLeaders

	pairings, err := r.pelletCommunityPairings(ctx, brand, modelName, excludeSimulated)
	if err != nil {
		return nil, err
	}
	c.TopPairings = pairings

	return c, nil
}

// blankCommunity strips every figure from a below-threshold community block so
// no aggregate can leak from a group too small to anonymise.
func blankCommunity(c *model.GearCommunity) *model.GearCommunity {
	return &model.GearCommunity{
		OptedIn:      c.OptedIn,
		Eligible:     false,
		MinOwners:    c.MinOwners,
		OwnerCount:   c.OwnerCount,
		Distribution: newScoreBins(),
		Trend:        []model.GearTrendPoint{},
		TopPairings:  []model.GearPairing{},
		Leaders:      []model.GearLeader{},
		GroupLeaders: []model.GearGroupLeader{},
	}
}

func (r *GearShowcaseRepository) communityScoreDistribution(ctx context.Context, base, a, b string) ([]model.GearHistogramBin, error) {
	rows, err := r.db.Query(ctx, base+`
		SELECT total_score::int, COUNT(*)::int FROM cards GROUP BY total_score
	`, a, b)
	if err != nil {
		return nil, fmt.Errorf("get community score distribution: %w", err)
	}
	defer rows.Close()

	bins := newScoreBins()
	for rows.Next() {
		var score, count int
		if err := rows.Scan(&score, &count); err != nil {
			return nil, fmt.Errorf("scan community score distribution: %w", err)
		}
		addToBins(bins, score, count)
	}
	return bins, rows.Err()
}

func (r *GearShowcaseRepository) communityScoreTrend(ctx context.Context, base, a, b string) ([]model.GearTrendPoint, error) {
	rows, err := r.db.Query(ctx, base+`
		SELECT
			DATE_TRUNC('month', shot_at)::date::text,
			ROUND(AVG(total_score)::numeric, 2)::float8,
			MAX(total_score)::int,
			ROUND(AVG(x_count)::numeric, 2)::float8,
			ROUND(COALESCE(STDDEV_POP(total_score), 0)::numeric, 2)::float8,
			COUNT(*)::int
		FROM cards
		GROUP BY DATE_TRUNC('month', shot_at)
		ORDER BY 1
	`, a, b)
	if err != nil {
		return nil, fmt.Errorf("get community trend: %w", err)
	}
	defer rows.Close()

	points := []model.GearTrendPoint{}
	for rows.Next() {
		var p model.GearTrendPoint
		if err := rows.Scan(&p.Period, &p.AvgScore, &p.BestScore, &p.AvgXCount, &p.StdDev, &p.CardCount); err != nil {
			return nil, fmt.Errorf("scan community trend: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func (r *GearShowcaseRepository) rifleLeaders(ctx context.Context, make, modelName, viewerID string, excludeSimulated bool) ([]model.GearLeader, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.display_name, u.avatar_url,
		       MAX(sc.total_score)::int, MAX(sc.x_count)::int,
		       ROUND(AVG(sc.total_score)::numeric, 2), COUNT(*)::int
		FROM score_cards sc
		JOIN rifles rf ON rf.id = sc.rifle_id
		JOIN users u   ON u.id = sc.user_id
		WHERE LOWER(BTRIM(rf.make)) = LOWER(BTRIM($1))
		  AND LOWER(BTRIM(rf.model)) = LOWER(BTRIM($2))
		  AND rf.comparison_opt_in
		  AND u.profile_visibility = 'public'
		  AND sc.is_draft = FALSE
		  AND ($3::bool = FALSE OR NOT u.is_simulated)
		GROUP BY u.id, u.display_name, u.avatar_url
		ORDER BY MAX(sc.total_score) DESC, MAX(sc.x_count) DESC, AVG(sc.total_score) DESC
		LIMIT 10
	`, make, modelName, excludeSimulated)
	if err != nil {
		return nil, fmt.Errorf("get rifle leaders: %w", err)
	}
	defer rows.Close()

	leaders := []model.GearLeader{}
	for rows.Next() {
		var l model.GearLeader
		if err := rows.Scan(&l.UserID, &l.DisplayName, &l.AvatarURL, &l.BestScore, &l.BestXCount, &l.AvgScore, &l.CardCount); err != nil {
			return nil, fmt.Errorf("scan rifle leader: %w", err)
		}
		l.IsYou = l.UserID == viewerID
		leaders = append(leaders, l)
	}
	return leaders, rows.Err()
}

func (r *GearShowcaseRepository) pelletGroupLeaders(ctx context.Context, brand, modelName, viewerID string, excludeSimulated bool) ([]model.GearGroupLeader, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT ON (u.id)
		       u.id::text, u.display_name, u.avatar_url,
		       ROUND(pts.best_group_size_mm::numeric, 2)::float8,
		       ROUND(AVG(pts.average_group_size_mm) OVER (PARTITION BY u.id)::numeric, 2),
		       COUNT(*) OVER (PARTITION BY u.id)::int,
		       rf.make || ' ' || rf.model
		FROM pellet_test_sessions pts
		JOIN pellets p ON p.id = pts.pellet_id
		JOIN rifles rf ON rf.id = pts.rifle_id
		JOIN users u   ON u.id = pts.user_id
		WHERE LOWER(BTRIM(p.brand)) = LOWER(BTRIM($1))
		  AND LOWER(BTRIM(p.model)) = LOWER(BTRIM($2))
		  AND p.comparison_opt_in
		  AND u.profile_visibility = 'public'
		  AND pts.is_draft = FALSE AND pts.group_count > 0
		  AND pts.best_group_size_mm IS NOT NULL
		  AND ($3::bool = FALSE OR NOT u.is_simulated)
		ORDER BY u.id, pts.best_group_size_mm ASC
	`, brand, modelName, excludeSimulated)
	if err != nil {
		return nil, fmt.Errorf("get pellet group leaders: %w", err)
	}
	defer rows.Close()

	leaders := []model.GearGroupLeader{}
	for rows.Next() {
		var l model.GearGroupLeader
		if err := rows.Scan(&l.UserID, &l.DisplayName, &l.AvatarURL, &l.BestGroupMM, &l.AvgGroupMM, &l.TestCount, &l.RifleName); err != nil {
			return nil, fmt.Errorf("scan pellet group leader: %w", err)
		}
		l.IsYou = l.UserID == viewerID
		leaders = append(leaders, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// DISTINCT ON forces an ordering by user id; rank on group size for display
	// and cap the list here rather than in SQL.
	sortGroupLeaders(leaders)
	if len(leaders) > 10 {
		leaders = leaders[:10]
	}
	return leaders, nil
}

func (r *GearShowcaseRepository) rifleCommunityPairings(ctx context.Context, make, modelName string, excludeSimulated bool) ([]model.GearPairing, error) {
	rows, err := r.db.Query(ctx, `
		SELECT NULL::text, p.brand || ' ' || p.model,
		       COUNT(*)::int,
		       ROUND(AVG(sc.total_score)::numeric, 2), MAX(sc.total_score)::int,
		       COUNT(DISTINCT sc.user_id)::int
		FROM score_cards sc
		JOIN rifles  rf ON rf.id = sc.rifle_id
		JOIN pellets p  ON p.id = sc.pellet_id
		JOIN users   u  ON u.id = sc.user_id
		WHERE LOWER(BTRIM(rf.make)) = LOWER(BTRIM($1))
		  AND LOWER(BTRIM(rf.model)) = LOWER(BTRIM($2))
		  AND rf.comparison_opt_in AND p.comparison_opt_in
		  AND u.profile_visibility <> 'private'
		  AND sc.is_draft = FALSE
		  AND ($3::bool = FALSE OR NOT u.is_simulated)
		GROUP BY p.brand, p.model
		ORDER BY COUNT(*) DESC
		LIMIT 8
	`, make, modelName, excludeSimulated)
	if err != nil {
		return nil, fmt.Errorf("get rifle community pairings: %w", err)
	}
	return scanCommunityPairings(rows)
}

func (r *GearShowcaseRepository) pelletCommunityPairings(ctx context.Context, brand, modelName string, excludeSimulated bool) ([]model.GearPairing, error) {
	rows, err := r.db.Query(ctx, `
		SELECT NULL::text, rf.make || ' ' || rf.model,
		       COUNT(*)::int,
		       ROUND(AVG(sc.total_score)::numeric, 2), MAX(sc.total_score)::int,
		       COUNT(DISTINCT sc.user_id)::int
		FROM score_cards sc
		JOIN rifles  rf ON rf.id = sc.rifle_id
		JOIN pellets p  ON p.id = sc.pellet_id
		JOIN users   u  ON u.id = sc.user_id
		WHERE LOWER(BTRIM(p.brand)) = LOWER(BTRIM($1))
		  AND LOWER(BTRIM(p.model)) = LOWER(BTRIM($2))
		  AND rf.comparison_opt_in AND p.comparison_opt_in
		  AND u.profile_visibility <> 'private'
		  AND sc.is_draft = FALSE
		  AND ($3::bool = FALSE OR NOT u.is_simulated)
		GROUP BY rf.make, rf.model
		ORDER BY COUNT(*) DESC
		LIMIT 8
	`, brand, modelName, excludeSimulated)
	if err != nil {
		return nil, fmt.Errorf("get pellet community pairings: %w", err)
	}
	return scanCommunityPairings(rows)
}

// ── shared scan/bin helpers ─────────────────────────────────────────────────

// gearColumn whitelists the two gear foreign keys that can be interpolated
// into a query. Anything else is a programming error, not user input, and is
// mapped to a column that cannot exist so the query fails loudly rather than
// silently widening.
func gearColumn(column string) string {
	switch column {
	case "rifle_id", "pellet_id":
		return column
	default:
		return "invalid_gear_column"
	}
}

func newScoreBins() []model.GearHistogramBin {
	bins := make([]model.GearHistogramBin, 0, len(scoreBins))
	for _, b := range scoreBins {
		bins = append(bins, model.GearHistogramBin{Label: b.label, Min: b.min, Max: b.max})
	}
	return bins
}

func newGroupBins() []model.GearHistogramBin {
	bins := make([]model.GearHistogramBin, 0, len(groupBins))
	for _, b := range groupBins {
		bins = append(bins, model.GearHistogramBin{Label: b.label, Min: b.min, Max: b.max})
	}
	return bins
}

func addToBins(bins []model.GearHistogramBin, value, count int) {
	for i := range bins {
		if value >= bins[i].Min && value <= bins[i].Max {
			bins[i].Count += count
			return
		}
	}
}

func sortGroupLeaders(leaders []model.GearGroupLeader) {
	for i := 1; i < len(leaders); i++ {
		for j := i; j > 0 && leaders[j].BestGroupMM < leaders[j-1].BestGroupMM; j-- {
			leaders[j], leaders[j-1] = leaders[j-1], leaders[j]
		}
	}
}

func scanPairings(rows pgx.Rows) ([]model.GearPairing, error) {
	defer rows.Close()
	pairings := []model.GearPairing{}
	for rows.Next() {
		var p model.GearPairing
		if err := rows.Scan(&p.GearID, &p.Name, &p.CardCount, &p.AvgScore, &p.BestScore,
			&p.TestCount, &p.AvgGroupMM, &p.BestGroupMM); err != nil {
			return nil, fmt.Errorf("scan gear pairing: %w", err)
		}
		pairings = append(pairings, p)
	}
	return pairings, rows.Err()
}

func scanCommunityPairings(rows pgx.Rows) ([]model.GearPairing, error) {
	defer rows.Close()
	pairings := []model.GearPairing{}
	for rows.Next() {
		var p model.GearPairing
		if err := rows.Scan(&p.GearID, &p.Name, &p.CardCount, &p.AvgScore, &p.BestScore, &p.UserCount); err != nil {
			return nil, fmt.Errorf("scan community pairing: %w", err)
		}
		pairings = append(pairings, p)
	}
	return pairings, rows.Err()
}
