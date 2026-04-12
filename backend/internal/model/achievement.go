package model

import "time"

type AchievementDef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

type UserAchievement struct {
	AchievementDef
	EarnedAt time.Time `json:"earned_at"`
}
