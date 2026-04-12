package handler

import (
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type StatsHandler struct {
	svc *service.StatsService
}

func NewStats(svc *service.StatsService) *StatsHandler {
	return &StatsHandler{svc: svc}
}

// GET /api/v1/users/me/stats
func (h *StatsHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	stats, err := h.svc.GetUserStats(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch stats")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

// GET /api/v1/users/me/rifle-stats
func (h *StatsHandler) GetRifleStats(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	stats, err := h.svc.GetRifleStats(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch rifle stats")
		return
	}

	if stats == nil {
		stats = []*model.RifleStats{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": stats})
}

// GET /api/v1/users/me/score-trends?period=week&rifle_id=<uuid>
func (h *StatsHandler) GetScoreTrends(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	var rifleID *string
	if rid := r.URL.Query().Get("rifle_id"); rid != "" {
		rifleID = &rid
	}

	points, err := h.svc.GetScoreTrends(r.Context(), userID, period, rifleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch score trends")
		return
	}

	if points == nil {
		points = []*model.ScoreTrendPoint{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": points})
}
