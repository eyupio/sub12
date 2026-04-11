package model

type UserStats struct {
	CardsLogged int      `json:"cards_logged"`
	BestScore   *int16   `json:"best_score,omitempty"`
	BestXCount  *int16   `json:"best_x_count,omitempty"`
	AvgScore    *float64 `json:"avg_score,omitempty"`
}
