package model

// Gear showcase types. A "showcase" is the full read model behind the gear
// detail page: the owner's own performance with one rifle or pellet, plus an
// anonymised comparison against every other user running the same make/model.
//
// Cross-user aggregates are only ever built from gear rows whose owner has
// opted that item in (rifles.comparison_opt_in / pellets.comparison_opt_in)
// and whose profile is not private, and are suppressed entirely until
// GearMinComparisonOwners distinct owners contribute.

// GearMinComparisonOwners is the k-anonymity floor for community aggregates.
// Below this many contributing owners the comparison block is returned with
// Eligible=false and no figures.
const GearMinComparisonOwners = 3

// GearPersonalStats is the owner's own record with a single piece of gear.
type GearPersonalStats struct {
	CardCount    int      `json:"card_count"`
	ShotsFired   int      `json:"shots_fired"`
	BestScore    *int     `json:"best_score,omitempty"`
	BestXCount   *int     `json:"best_x_count,omitempty"`
	BestCardID   *string  `json:"best_card_id,omitempty"`
	AvgScore     *float64 `json:"avg_score,omitempty"`
	AvgXCount    *float64 `json:"avg_x_count,omitempty"`
	StdDev       *float64 `json:"std_dev,omitempty"`
	Rolling10Avg *float64 `json:"rolling_10_avg,omitempty"`
	FirstUsed    *string  `json:"first_used,omitempty"`
	LastUsed     *string  `json:"last_used,omitempty"`
	ActiveDays   int      `json:"active_days"`
	TestCount    int      `json:"test_count"`
	GroupCount   int      `json:"group_count"`
	BestGroupMM  *float64 `json:"best_group_mm,omitempty"`
	AvgGroupMM   *float64 `json:"avg_group_mm,omitempty"`
	PerfectShots int      `json:"perfect_shots"`
	XPercentage  *float64 `json:"x_percentage,omitempty"`
}

// GearTrendPoint is one bucket of the score-over-time chart.
type GearTrendPoint struct {
	Period    string  `json:"period"`
	AvgScore  float64 `json:"avg_score"`
	BestScore *int    `json:"best_score,omitempty"`
	AvgXCount float64 `json:"avg_x_count"`
	StdDev    float64 `json:"std_dev"`
	CardCount int     `json:"card_count"`
}

// GearGroupPoint is one bucket of the pellet-test group-size chart.
type GearGroupPoint struct {
	Period      string   `json:"period"`
	AvgGroupMM  float64  `json:"avg_group_mm"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
	TestCount   int      `json:"test_count"`
}

// GearHistogramBin is one column of a distribution chart. Label is
// pre-rendered server-side so the chart stays a dumb renderer.
type GearHistogramBin struct {
	Label string `json:"label"`
	Min   int    `json:"min"`
	Max   int    `json:"max"`
	Count int    `json:"count"`
}

// GearShotBucket counts how often a given shot value (0-10) was scored.
type GearShotBucket struct {
	Value int `json:"value"`
	Count int `json:"count"`
}

// GearPairing is one rifle+pellet combination. Used both for the owner's own
// pairings and for the community's most-popular pairings with this gear.
type GearPairing struct {
	GearID      *string  `json:"gear_id,omitempty"`
	Name        string   `json:"name"`
	CardCount   int      `json:"card_count"`
	UserCount   int      `json:"user_count"`
	AvgScore    *float64 `json:"avg_score,omitempty"`
	BestScore   *int     `json:"best_score,omitempty"`
	TestCount   int      `json:"test_count"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
}

// GearRecentCard is a compact score-card row for the showcase activity list.
type GearRecentCard struct {
	ID         string `json:"id"`
	ShotAt     string `json:"shot_at"`
	TotalScore int    `json:"total_score"`
	XCount     int    `json:"x_count"`
	Location   string `json:"location,omitempty"`
}

// GearLeader is one entry of the community leaderboard for a gear model.
// Only opted-in owners with non-private profiles appear here.
type GearLeader struct {
	UserID      string   `json:"user_id"`
	DisplayName string   `json:"display_name"`
	AvatarURL   *string  `json:"avatar_url,omitempty"`
	BestScore   int      `json:"best_score"`
	BestXCount  int      `json:"best_x_count"`
	AvgScore    *float64 `json:"avg_score,omitempty"`
	CardCount   int      `json:"card_count"`
	IsYou       bool     `json:"is_you"`
}

// GearGroupLeader is the pellet equivalent of GearLeader, ranked on group size.
type GearGroupLeader struct {
	UserID      string   `json:"user_id"`
	DisplayName string   `json:"display_name"`
	AvatarURL   *string  `json:"avatar_url,omitempty"`
	BestGroupMM float64  `json:"best_group_mm"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	TestCount   int      `json:"test_count"`
	RifleName   string   `json:"rifle_name,omitempty"`
	IsYou       bool     `json:"is_you"`
}

// GearCommunity is the anonymised cross-user comparison block.
type GearCommunity struct {
	// OptedIn reflects this item's comparison_opt_in. When false the owner
	// sees no community figures and contributes none.
	OptedIn bool `json:"opted_in"`
	// Eligible is false when fewer than MinOwners opted-in owners run this
	// model, in which case every figure below is zero/nil.
	Eligible  bool `json:"eligible"`
	MinOwners int  `json:"min_owners"`

	OwnerCount int `json:"owner_count"`
	CardCount  int `json:"card_count"`
	TestCount  int `json:"test_count"`

	AvgScore    *float64 `json:"avg_score,omitempty"`
	MedianScore *float64 `json:"median_score,omitempty"`
	P90Score    *float64 `json:"p90_score,omitempty"`
	BestScore   *int     `json:"best_score,omitempty"`
	AvgXCount   *float64 `json:"avg_x_count,omitempty"`

	AvgGroupMM    *float64 `json:"avg_group_mm,omitempty"`
	MedianGroupMM *float64 `json:"median_group_mm,omitempty"`
	BestGroupMM   *float64 `json:"best_group_mm,omitempty"`

	// YourPercentile is where the viewer's own average sits in the
	// distribution of per-owner averages (0-100, higher is better).
	YourPercentile *float64 `json:"your_percentile,omitempty"`
	YourRank       *int     `json:"your_rank,omitempty"`

	Distribution []GearHistogramBin `json:"distribution"`
	Trend        []GearTrendPoint   `json:"trend"`
	TopPairings  []GearPairing      `json:"top_pairings"`
	Leaders      []GearLeader       `json:"leaders"`
	GroupLeaders []GearGroupLeader  `json:"group_leaders"`
}

// RifleShowcase is the full read model for the rifle detail page.
type RifleShowcase struct {
	Rifle             *Rifle             `json:"rifle"`
	ModelKey          string             `json:"model_key"`
	Personal          GearPersonalStats  `json:"personal"`
	ScoreTrend        []GearTrendPoint   `json:"score_trend"`
	ScoreDistribution []GearHistogramBin `json:"score_distribution"`
	ShotBreakdown     []GearShotBucket   `json:"shot_breakdown"`
	GroupTrend        []GearGroupPoint   `json:"group_trend"`
	Pairings          []GearPairing      `json:"pairings"`
	RecentCards       []GearRecentCard   `json:"recent_cards"`
	Community         GearCommunity      `json:"community"`
}

// PelletShowcase is the full read model for the pellet detail page.
type PelletShowcase struct {
	Pellet            *Pellet            `json:"pellet"`
	ModelKey          string             `json:"model_key"`
	Personal          GearPersonalStats  `json:"personal"`
	ScoreTrend        []GearTrendPoint   `json:"score_trend"`
	ScoreDistribution []GearHistogramBin `json:"score_distribution"`
	GroupTrend        []GearGroupPoint   `json:"group_trend"`
	GroupDistribution []GearHistogramBin `json:"group_distribution"`
	Pairings          []GearPairing      `json:"pairings"`
	RecentCards       []GearRecentCard   `json:"recent_cards"`
	Community         GearCommunity      `json:"community"`
}

// ── Admin site-wide gear analytics ──────────────────────────────────────────

// AdminGearTotals is the headline counter row on the admin gear dashboard.
type AdminGearTotals struct {
	Rifles             int     `json:"rifles"`
	Pellets            int     `json:"pellets"`
	RifleModels        int     `json:"rifle_models"`
	PelletModels       int     `json:"pellet_models"`
	RifleMakes         int     `json:"rifle_makes"`
	PelletBrands       int     `json:"pellet_brands"`
	OwnersWithGear     int     `json:"owners_with_gear"`
	ActiveRifles       int     `json:"active_rifles"`
	ActivePellets      int     `json:"active_pellets"`
	RiflesOptedIn      int     `json:"rifles_opted_in"`
	PelletsOptedIn     int     `json:"pellets_opted_in"`
	OptInRate          float64 `json:"opt_in_rate"`
	RiflesWithImages   int     `json:"rifles_with_images"`
	PelletsWithImages  int     `json:"pellets_with_images"`
	CardsWithRifle     int     `json:"cards_with_rifle"`
	CardsWithPellet    int     `json:"cards_with_pellet"`
	OrphanCards        int     `json:"orphan_cards"`
	AvgRiflesPerOwner  float64 `json:"avg_rifles_per_owner"`
	AvgPelletsPerOwner float64 `json:"avg_pellets_per_owner"`
}

// AdminGearModel is one row of the site-wide gear model leaderboard. Kind is
// "rifle" or "pellet"; Make holds the rifle make or the pellet brand.
type AdminGearModel struct {
	Kind         string   `json:"kind"`
	Make         string   `json:"make"`
	Model        string   `json:"model"`
	OwnerCount   int      `json:"owner_count"`
	ItemCount    int      `json:"item_count"`
	OptedInCount int      `json:"opted_in_count"`
	CardCount    int      `json:"card_count"`
	TestCount    int      `json:"test_count"`
	AvgScore     *float64 `json:"avg_score,omitempty"`
	BestScore    *int     `json:"best_score,omitempty"`
	AvgGroupMM   *float64 `json:"avg_group_mm,omitempty"`
	BestGroupMM  *float64 `json:"best_group_mm,omitempty"`
	FirstSeen    string   `json:"first_seen"`
	LastUsed     *string  `json:"last_used,omitempty"`
}

// AdminGearCombo is one rifle+pellet pairing aggregated across all users.
type AdminGearCombo struct {
	RifleMake   string   `json:"rifle_make"`
	RifleModel  string   `json:"rifle_model"`
	PelletBrand string   `json:"pellet_brand"`
	PelletModel string   `json:"pellet_model"`
	UserCount   int      `json:"user_count"`
	CardCount   int      `json:"card_count"`
	TestCount   int      `json:"test_count"`
	AvgScore    *float64 `json:"avg_score,omitempty"`
	BestScore   *int     `json:"best_score,omitempty"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
}

// AdminGearSlice is a generic label/count pair for the distribution charts
// (calibre split, rifle makes, pellet brands, weight bands).
type AdminGearSlice struct {
	Label string  `json:"label"`
	Count int     `json:"count"`
	Share float64 `json:"share"`
}

// AdminGearAdoptionPoint is one month of gear registrations.
type AdminGearAdoptionPoint struct {
	Period  string `json:"period"`
	Rifles  int    `json:"rifles"`
	Pellets int    `json:"pellets"`
}

// AdminGearStats is the whole admin gear dashboard payload.
type AdminGearStats struct {
	Totals            AdminGearTotals          `json:"totals"`
	TopRifles         []AdminGearModel         `json:"top_rifles"`
	TopPellets        []AdminGearModel         `json:"top_pellets"`
	TopCombos         []AdminGearCombo         `json:"top_combos"`
	CalibreSplit      []AdminGearSlice         `json:"calibre_split"`
	RifleMakeSplit    []AdminGearSlice         `json:"rifle_make_split"`
	PelletBrandSplit  []AdminGearSlice         `json:"pellet_brand_split"`
	PelletWeightSplit []AdminGearSlice         `json:"pellet_weight_split"`
	PowerSplit        []AdminGearSlice         `json:"power_split"`
	Adoption          []AdminGearAdoptionPoint `json:"adoption"`
}

// AdminGearModelOwner is one owner row in the admin model drill-down.
type AdminGearModelOwner struct {
	UserID      string   `json:"user_id"`
	DisplayName string   `json:"display_name"`
	Email       string   `json:"email"`
	IsSimulated bool     `json:"is_simulated"`
	OptedIn     bool     `json:"opted_in"`
	ItemCount   int      `json:"item_count"`
	CardCount   int      `json:"card_count"`
	TestCount   int      `json:"test_count"`
	AvgScore    *float64 `json:"avg_score,omitempty"`
	BestScore   *int     `json:"best_score,omitempty"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
	AddedAt     string   `json:"added_at"`
}

// AdminGearModelDetail is the admin drill-down for one gear model.
type AdminGearModelDetail struct {
	Model  AdminGearModel        `json:"model"`
	Owners []AdminGearModelOwner `json:"owners"`
	Trend  []GearTrendPoint      `json:"trend"`
}
