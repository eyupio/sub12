package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type MuteHandler struct {
	repo *repository.MuteRepository
}

func NewMute(repo *repository.MuteRepository) *MuteHandler {
	return &MuteHandler{repo: repo}
}

// POST /api/v1/users/{id}/mute
func (h *MuteHandler) Mute(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID := chi.URLParam(r, "id")
	if userID == targetID {
		writeError(w, http.StatusUnprocessableEntity, "cannot mute yourself")
		return
	}
	if err := h.repo.Mute(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mute user")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"muted": true})
}

// DELETE /api/v1/users/{id}/mute
func (h *MuteHandler) Unmute(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID := chi.URLParam(r, "id")
	if err := h.repo.Unmute(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unmute user")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"muted": false})
}

// GET /api/v1/users/me/mutes
func (h *MuteHandler) ListMuted(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ids, err := h.repo.ListMuted(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list mutes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": ids})
}
