package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AchievementHandler struct {
	svc *service.AchievementService
}

func NewAchievement(svc *service.AchievementService) *AchievementHandler {
	return &AchievementHandler{svc: svc}
}

// GET /api/v1/users/me/achievements
func (h *AchievementHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	items, err := h.svc.ListForUser(r.Context(), userID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load achievements")
		return
	}
	if items == nil {
		items = make([]*model.UserAchievement, 0)
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/users/{id}/achievements
func (h *AchievementHandler) ListForUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	items, err := h.svc.ListForUser(r.Context(), userID, viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		if errors.Is(err, service.ErrAccessDenied) {
			writeError(w, http.StatusForbidden, "this profile is private")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load achievements")
		return
	}
	if items == nil {
		items = make([]*model.UserAchievement, 0)
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
