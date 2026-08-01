package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// AdminGearRepository backs the site-wide gear analytics dashboard. Unlike the
// user-facing showcase these queries deliberately ignore comparison_opt_in and
// profile visibility — an admin is looking at the whole estate, including gear
// its owner has kept out of public comparison. The opt-in flag is still
// reported so admins can see how much of the estate feeds public aggregates.
type AdminGearRepository struct {
	db *pgxpool.Pool
}

func NewAdminGearRepository(db *pgxpool.Pool) *AdminGearRepository {
	return &AdminGearRepository{db: db}
}

// adminGearSort maps the caller-facing sort keys onto ORDER BY fragments.
// Anything unrecognised falls back to owner count so no caller-supplied string
// ever reaches the query.
func adminGearSort(sort string) string {
	switch sort {
	case "items":
		return "item_count DESC"
	case "cards":
		return "card_count DESC"
	case "tests":
		return "test_count DESC"
	case "avg_score":
		return "avg_score DESC NULLS LAST"
	case "best_score":
		return "best_score DESC NULLS LAST"
	case "avg_group":
		return "avg_group_mm ASC NULLS LAST"
	case "best_group":
		return "best_group_mm ASC NULLS LAST"
	case "recent":
		return "last_used DESC NULLS LAST"
	case "name":
		return "make ASC, model ASC"
	default:
		return "owner_count DESC"
	}
}

// GetTotals returns the headline counters for the admin gear dashboard.
func (r *AdminGearRepository) GetTotals(ctx context.Context) (*model.AdminGearTotals, error) {
	var t model.AdminGearTotals
	err := r.db.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::int FROM rifles),
			(SELECT COUNT(*)::int FROM pellets),
			(SELECT COUNT(*)::int FROM (SELECT DISTINCT LOWER(BTRIM(make)), LOWER(BTRIM(model)) FROM rifles) x),
			(SELECT COUNT(*)::int FROM (SELECT DISTINCT LOWER(BTRIM(brand)), LOWER(BTRIM(model)) FROM pellets) x),
			(SELECT COUNT(DISTINCT LOWER(BTRIM(make)))::int FROM rifles),
			(SELECT COUNT(DISTINCT LOWER(BTRIM(brand)))::int FROM pellets),
			(SELECT COUNT(*)::int FROM (
				SELECT user_id FROM rifles UNION SELECT user_id FROM pellets
			) owners),
			(SELECT COUNT(*)::int FROM rifles  WHERE is_active),
			(SELECT COUNT(*)::int FROM pellets WHERE is_active),
			(SELECT COUNT(*)::int FROM rifles  WHERE comparison_opt_in),
			(SELECT COUNT(*)::int FROM pellets WHERE comparison_opt_in),
			(SELECT COUNT(*)::int FROM rifles  WHERE image_url IS NOT NULL),
			(SELECT COUNT(*)::int FROM pellets WHERE image_url IS NOT NULL),
			(SELECT COUNT(*)::int FROM score_cards WHERE rifle_id  IS NOT NULL AND is_draft = FALSE),
			(SELECT COUNT(*)::int FROM score_cards WHERE pellet_id IS NOT NULL AND is_draft = FALSE),
			(SELECT COUNT(*)::int FROM score_cards WHERE rifle_id IS NULL AND pellet_id IS NULL AND is_draft = FALSE)
	`).Scan(
		&t.Rifles, &t.Pellets, &t.RifleModels, &t.PelletModels,
		&t.RifleMakes, &t.PelletBrands, &t.OwnersWithGear,
		&t.ActiveRifles, &t.ActivePellets,
		&t.RiflesOptedIn, &t.PelletsOptedIn,
		&t.RiflesWithImages, &t.PelletsWithImages,
		&t.CardsWithRifle, &t.CardsWithPellet, &t.OrphanCards,
	)
	if err != nil {
		return nil, fmt.Errorf("get admin gear totals: %w", err)
	}

	if total := t.Rifles + t.Pellets; total > 0 {
		t.OptInRate = round2(float64(t.RiflesOptedIn+t.PelletsOptedIn) / float64(total) * 100)
	}
	if t.OwnersWithGear > 0 {
		t.AvgRiflesPerOwner = round2(float64(t.Rifles) / float64(t.OwnersWithGear))
		t.AvgPelletsPerOwner = round2(float64(t.Pellets) / float64(t.OwnersWithGear))
	}
	return &t, nil
}

// ListModels returns the site-wide gear model leaderboard. kind is "rifle" or
// "pellet"; q filters on make/brand or model; sort is one of the adminGearSort
// keys. The second return value is the unpaginated total.
func (r *AdminGearRepository) ListModels(ctx context.Context, kind, q, sort string, limit, offset int) ([]*model.AdminGearModel, int, error) {
	table, nameCol, fk := "rifles", "make", "rifle_id"
	if kind == "pellet" {
		table, nameCol, fk = "pellets", "brand", "pellet_id"
	}

	query := `
		WITH items AS (
			SELECT id, user_id, ` + nameCol + ` AS make, model, comparison_opt_in, created_at,
			       LOWER(BTRIM(` + nameCol + `)) AS mk, LOWER(BTRIM(model)) AS md
			FROM ` + table + `
			WHERE ($1 = '' OR ` + nameCol + ` ILIKE '%' || $1 || '%' OR model ILIKE '%' || $1 || '%')
		),
		base AS (
			SELECT mk, md, MIN(make) AS make, MIN(model) AS model,
			       COUNT(DISTINCT user_id)::int AS owner_count,
			       COUNT(*)::int                AS item_count,
			       COUNT(*) FILTER (WHERE comparison_opt_in)::int AS opted_in_count,
			       MIN(created_at)::date::text  AS first_seen
			FROM items GROUP BY mk, md
		),
		cards AS (
			SELECT i.mk, i.md, COUNT(*)::int AS card_count,
			       ROUND(AVG(sc.total_score)::numeric, 2) AS avg_score,
			       MAX(sc.total_score)::int AS best_score,
			       MAX(sc.shot_at)::text    AS last_used
			FROM score_cards sc
			JOIN items i ON i.id = sc.` + fk + `
			WHERE sc.is_draft = FALSE
			GROUP BY i.mk, i.md
		),
		tests AS (
			SELECT i.mk, i.md, COUNT(*)::int AS test_count,
			       ROUND(AVG(ts.average_group_size_mm)::numeric, 2) AS avg_group_mm,
			       ROUND(MIN(ts.best_group_size_mm)::numeric, 2)    AS best_group_mm
			FROM pellet_test_sessions ts
			JOIN items i ON i.id = ts.` + fk + `
			WHERE ts.is_draft = FALSE AND ts.group_count > 0
			GROUP BY i.mk, i.md
		),
		agg AS (
			SELECT b.make, b.model, b.owner_count, b.item_count, b.opted_in_count,
			       COALESCE(c.card_count, 0) AS card_count,
			       COALESCE(t.test_count, 0) AS test_count,
			       c.avg_score, c.best_score, t.avg_group_mm, t.best_group_mm,
			       b.first_seen, c.last_used
			FROM base b
			LEFT JOIN cards c ON c.mk = b.mk AND c.md = b.md
			LEFT JOIN tests t ON t.mk = b.mk AND t.md = b.md
		)
		SELECT make, model, owner_count, item_count, opted_in_count, card_count, test_count,
		       avg_score, best_score, avg_group_mm, best_group_mm, first_seen, last_used,
		       COUNT(*) OVER ()::int
		FROM agg
		ORDER BY ` + adminGearSort(sort) + `, make ASC, model ASC
		LIMIT $2 OFFSET $3`

	rows, err := r.db.Query(ctx, query, q, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin gear models: %w", err)
	}
	defer rows.Close()

	items := []*model.AdminGearModel{}
	total := 0
	for rows.Next() {
		m := &model.AdminGearModel{Kind: kind}
		if err := rows.Scan(&m.Make, &m.Model, &m.OwnerCount, &m.ItemCount, &m.OptedInCount,
			&m.CardCount, &m.TestCount, &m.AvgScore, &m.BestScore,
			&m.AvgGroupMM, &m.BestGroupMM, &m.FirstSeen, &m.LastUsed, &total); err != nil {
			return nil, 0, fmt.Errorf("scan admin gear model: %w", err)
		}
		items = append(items, m)
	}
	return items, total, rows.Err()
}

// GetTopCombos returns the most-used rifle+pellet pairings across the site,
// ranked by the number of distinct users running them.
func (r *AdminGearRepository) GetTopCombos(ctx context.Context, limit int) ([]*model.AdminGearCombo, error) {
	rows, err := r.db.Query(ctx, `
		WITH card_side AS (
			SELECT LOWER(BTRIM(rf.make)) mk, LOWER(BTRIM(rf.model)) md,
			       LOWER(BTRIM(p.brand)) pk, LOWER(BTRIM(p.model)) pd,
			       MIN(rf.make) rifle_make, MIN(rf.model) rifle_model,
			       MIN(p.brand) pellet_brand, MIN(p.model) pellet_model,
			       COUNT(*)::int card_count,
			       COUNT(DISTINCT sc.user_id)::int user_count,
			       ROUND(AVG(sc.total_score)::numeric, 2) avg_score,
			       MAX(sc.total_score)::int best_score
			FROM score_cards sc
			JOIN rifles rf ON rf.id = sc.rifle_id
			JOIN pellets p ON p.id = sc.pellet_id
			WHERE sc.is_draft = FALSE
			GROUP BY 1,2,3,4
		),
		test_side AS (
			SELECT LOWER(BTRIM(rf.make)) mk, LOWER(BTRIM(rf.model)) md,
			       LOWER(BTRIM(p.brand)) pk, LOWER(BTRIM(p.model)) pd,
			       MIN(rf.make) rifle_make, MIN(rf.model) rifle_model,
			       MIN(p.brand) pellet_brand, MIN(p.model) pellet_model,
			       COUNT(*)::int test_count,
			       COUNT(DISTINCT ts.user_id)::int user_count,
			       ROUND(AVG(ts.average_group_size_mm)::numeric, 2) avg_group_mm,
			       ROUND(MIN(ts.best_group_size_mm)::numeric, 2) best_group_mm
			FROM pellet_test_sessions ts
			JOIN rifles rf ON rf.id = ts.rifle_id
			JOIN pellets p ON p.id = ts.pellet_id
			WHERE ts.is_draft = FALSE AND ts.group_count > 0
			GROUP BY 1,2,3,4
		)
		SELECT
			COALESCE(c.rifle_make, t.rifle_make),
			COALESCE(c.rifle_model, t.rifle_model),
			COALESCE(c.pellet_brand, t.pellet_brand),
			COALESCE(c.pellet_model, t.pellet_model),
			GREATEST(COALESCE(c.user_count, 0), COALESCE(t.user_count, 0)),
			COALESCE(c.card_count, 0),
			COALESCE(t.test_count, 0),
			c.avg_score, c.best_score, t.avg_group_mm, t.best_group_mm
		FROM card_side c
		FULL OUTER JOIN test_side t
		  ON t.mk = c.mk AND t.md = c.md AND t.pk = c.pk AND t.pd = c.pd
		ORDER BY GREATEST(COALESCE(c.user_count, 0), COALESCE(t.user_count, 0)) DESC,
		         COALESCE(c.card_count, 0) + COALESCE(t.test_count, 0) DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("get admin gear combos: %w", err)
	}
	defer rows.Close()

	combos := []*model.AdminGearCombo{}
	for rows.Next() {
		c := &model.AdminGearCombo{}
		if err := rows.Scan(&c.RifleMake, &c.RifleModel, &c.PelletBrand, &c.PelletModel,
			&c.UserCount, &c.CardCount, &c.TestCount,
			&c.AvgScore, &c.BestScore, &c.AvgGroupMM, &c.BestGroupMM); err != nil {
			return nil, fmt.Errorf("scan admin gear combo: %w", err)
		}
		combos = append(combos, c)
	}
	return combos, rows.Err()
}

// GetSlices returns the distribution charts: calibre split, top rifle makes,
// top pellet brands, pellet weight bands and rifle power bands.
func (r *AdminGearRepository) GetSlices(ctx context.Context) (calibre, makes, brands, weights, power []model.AdminGearSlice, err error) {
	calibre, err = r.slice(ctx, `
		SELECT COALESCE(NULLIF(BTRIM(calibre), ''), 'Unspecified'), COUNT(*)::int
		FROM rifles GROUP BY 1 ORDER BY 2 DESC`)
	if err != nil {
		return
	}
	makes, err = r.slice(ctx, `
		SELECT MIN(make), COUNT(*)::int
		FROM rifles GROUP BY LOWER(BTRIM(make)) ORDER BY 2 DESC LIMIT 12`)
	if err != nil {
		return
	}
	brands, err = r.slice(ctx, `
		SELECT MIN(brand), COUNT(*)::int
		FROM pellets GROUP BY LOWER(BTRIM(brand)) ORDER BY 2 DESC LIMIT 12`)
	if err != nil {
		return
	}
	weights, err = r.slice(ctx, `
		SELECT CASE
			WHEN weight_grains IS NULL   THEN 'Unspecified'
			WHEN weight_grains < 8       THEN 'under 8gr'
			WHEN weight_grains < 9       THEN '8-9gr'
			WHEN weight_grains < 10      THEN '9-10gr'
			WHEN weight_grains < 14      THEN '10-14gr'
			WHEN weight_grains < 18      THEN '14-18gr'
			ELSE '18gr+'
		END, COUNT(*)::int
		FROM pellets GROUP BY 1 ORDER BY 2 DESC`)
	if err != nil {
		return
	}
	power, err = r.slice(ctx, `
		SELECT CASE
			WHEN power_ftlb IS NULL  THEN 'Unspecified'
			WHEN power_ftlb < 6      THEN 'under 6 ft·lb'
			WHEN power_ftlb < 11     THEN '6-11 ft·lb'
			WHEN power_ftlb <= 12    THEN 'sub-12'
			WHEN power_ftlb <= 30    THEN '12-30 ft·lb'
			ELSE 'FAC 30+ ft·lb'
		END, COUNT(*)::int
		FROM rifles GROUP BY 1 ORDER BY 2 DESC`)
	return
}

func (r *AdminGearRepository) slice(ctx context.Context, query string) ([]model.AdminGearSlice, error) {
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("get admin gear slice: %w", err)
	}
	defer rows.Close()

	slices := []model.AdminGearSlice{}
	total := 0
	for rows.Next() {
		var s model.AdminGearSlice
		if err := rows.Scan(&s.Label, &s.Count); err != nil {
			return nil, fmt.Errorf("scan admin gear slice: %w", err)
		}
		total += s.Count
		slices = append(slices, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range slices {
		if total > 0 {
			slices[i].Share = round2(float64(slices[i].Count) / float64(total) * 100)
		}
	}
	return slices, nil
}

// GetAdoption returns monthly gear registrations for the trailing window.
func (r *AdminGearRepository) GetAdoption(ctx context.Context, months int) ([]model.AdminGearAdoptionPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH span AS (
			SELECT GENERATE_SERIES(
				DATE_TRUNC('month', NOW()) - MAKE_INTERVAL(months => $1 - 1),
				DATE_TRUNC('month', NOW()),
				'1 month'
			) AS period
		)
		SELECT
			span.period::date::text,
			(SELECT COUNT(*)::int FROM rifles  WHERE DATE_TRUNC('month', created_at) = span.period),
			(SELECT COUNT(*)::int FROM pellets WHERE DATE_TRUNC('month', created_at) = span.period)
		FROM span
		ORDER BY span.period
	`, months)
	if err != nil {
		return nil, fmt.Errorf("get admin gear adoption: %w", err)
	}
	defer rows.Close()

	points := []model.AdminGearAdoptionPoint{}
	for rows.Next() {
		var p model.AdminGearAdoptionPoint
		if err := rows.Scan(&p.Period, &p.Rifles, &p.Pellets); err != nil {
			return nil, fmt.Errorf("scan admin gear adoption: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetModelOwners lists every account that owns a given gear model, with that
// owner's usage. Powers the admin drill-down.
func (r *AdminGearRepository) GetModelOwners(ctx context.Context, kind, make, modelName string, limit int) ([]model.AdminGearModelOwner, error) {
	table, nameCol, fk := "rifles", "make", "rifle_id"
	if kind == "pellet" {
		table, nameCol, fk = "pellets", "brand", "pellet_id"
	}

	rows, err := r.db.Query(ctx, `
		WITH items AS (
			SELECT id, user_id, comparison_opt_in, created_at
			FROM `+table+`
			WHERE LOWER(BTRIM(`+nameCol+`)) = LOWER(BTRIM($1))
			  AND LOWER(BTRIM(model)) = LOWER(BTRIM($2))
		),
		owned AS (
			SELECT user_id, COUNT(*)::int AS item_count,
			       BOOL_OR(comparison_opt_in) AS opted_in,
			       MIN(created_at)::date::text AS added_at
			FROM items GROUP BY user_id
		),
		cards AS (
			SELECT i.user_id, COUNT(*)::int AS card_count,
			       ROUND(AVG(sc.total_score)::numeric, 2) AS avg_score,
			       MAX(sc.total_score)::int AS best_score
			FROM score_cards sc
			JOIN items i ON i.id = sc.`+fk+`
			WHERE sc.is_draft = FALSE
			GROUP BY i.user_id
		),
		tests AS (
			SELECT i.user_id, COUNT(*)::int AS test_count,
			       ROUND(MIN(ts.best_group_size_mm)::numeric, 2) AS best_group_mm
			FROM pellet_test_sessions ts
			JOIN items i ON i.id = ts.`+fk+`
			WHERE ts.is_draft = FALSE AND ts.group_count > 0
			GROUP BY i.user_id
		)
		SELECT u.id::text, u.display_name, u.email, u.is_simulated,
		       o.opted_in, o.item_count,
		       COALESCE(c.card_count, 0), COALESCE(t.test_count, 0),
		       c.avg_score, c.best_score, t.best_group_mm, o.added_at
		FROM owned o
		JOIN users u ON u.id = o.user_id
		LEFT JOIN cards c ON c.user_id = o.user_id
		LEFT JOIN tests t ON t.user_id = o.user_id
		ORDER BY COALESCE(c.card_count, 0) DESC, u.display_name
		LIMIT $3
	`, make, modelName, limit)
	if err != nil {
		return nil, fmt.Errorf("get admin gear model owners: %w", err)
	}
	defer rows.Close()

	owners := []model.AdminGearModelOwner{}
	for rows.Next() {
		var o model.AdminGearModelOwner
		if err := rows.Scan(&o.UserID, &o.DisplayName, &o.Email, &o.IsSimulated, &o.OptedIn,
			&o.ItemCount, &o.CardCount, &o.TestCount, &o.AvgScore, &o.BestScore,
			&o.BestGroupMM, &o.AddedAt); err != nil {
			return nil, fmt.Errorf("scan admin gear model owner: %w", err)
		}
		owners = append(owners, o)
	}
	return owners, rows.Err()
}

// GetModelTrend buckets every card shot with a gear model, site-wide, by month.
func (r *AdminGearRepository) GetModelTrend(ctx context.Context, kind, make, modelName string) ([]model.GearTrendPoint, error) {
	join := "JOIN rifles g ON g.id = sc.rifle_id"
	match := "LOWER(BTRIM(g.make)) = LOWER(BTRIM($1))"
	if kind == "pellet" {
		join = "JOIN pellets g ON g.id = sc.pellet_id"
		match = "LOWER(BTRIM(g.brand)) = LOWER(BTRIM($1))"
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			DATE_TRUNC('month', sc.shot_at)::date::text,
			ROUND(AVG(sc.total_score)::numeric, 2)::float8,
			MAX(sc.total_score)::int,
			ROUND(AVG(sc.x_count)::numeric, 2)::float8,
			ROUND(COALESCE(STDDEV_POP(sc.total_score), 0)::numeric, 2)::float8,
			COUNT(*)::int
		FROM score_cards sc
		`+join+`
		WHERE `+match+` AND LOWER(BTRIM(g.model)) = LOWER(BTRIM($2)) AND sc.is_draft = FALSE
		GROUP BY DATE_TRUNC('month', sc.shot_at)
		ORDER BY 1
	`, make, modelName)
	if err != nil {
		return nil, fmt.Errorf("get admin gear model trend: %w", err)
	}
	defer rows.Close()

	points := []model.GearTrendPoint{}
	for rows.Next() {
		var p model.GearTrendPoint
		if err := rows.Scan(&p.Period, &p.AvgScore, &p.BestScore, &p.AvgXCount, &p.StdDev, &p.CardCount); err != nil {
			return nil, fmt.Errorf("scan admin gear model trend: %w", err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
