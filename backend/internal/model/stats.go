package model

type UserStats struct {
	CardsLogged  int      `json:"cards_logged"`
	BestScore    *int16   `json:"best_score,omitempty"`
	BestXCount   *int16   `json:"best_x_count,omitempty"`
	AvgScore     *float64 `json:"avg_score,omitempty"`
	Rolling10Avg *float64 `json:"rolling_10_avg,omitempty"`
}

type RifleStats struct {
	RifleID    string `json:"rifle_id"`
	BestScore  int16  `json:"best_score"`
	BestXCount int16  `json:"best_x_count"`
	CardCount  int    `json:"card_count"`
}

type ScoreTrendPoint struct {
	Period     string  `json:"period"`
	AvgScore   float64 `json:"avg_score"`
	BestScore  *int16  `json:"best_score,omitempty"`
	StdDev     float64 `json:"std_dev"`
	CardCount  int     `json:"card_count"`
	AvgXCount  float64 `json:"avg_x_count"`
	BestXCount *int16  `json:"best_x_count,omitempty"`
}

type ComboPerformanceSummary struct {
	RifleID     string   `json:"rifle_id"`
	RifleName   string   `json:"rifle_name"`
	PelletID    string   `json:"pellet_id"`
	PelletName  string   `json:"pellet_name"`
	BestGroupMM *float64 `json:"best_group_mm,omitempty"`
	AvgGroupMM  *float64 `json:"avg_group_mm,omitempty"`
	TestCount   int      `json:"test_count"`
	Consistency *float64 `json:"consistency,omitempty"`
	LastTested  string   `json:"last_tested"`
}
