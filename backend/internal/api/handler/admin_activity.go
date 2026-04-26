package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminActivityHandler struct {
	svc *service.ActivityService
}

func NewAdminActivity(svc *service.ActivityService) *AdminActivityHandler {
	return &AdminActivityHandler{svc: svc}
}

// DELETE /api/v1/admin/activities/{id}
// Soft-hides a feed activity for everyone. The optional ?reason=... query
// param is captured for the audit trail.
func (h *AdminActivityHandler) Hide(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	reason := r.URL.Query().Get("reason")

	if err := h.svc.AdminHide(r.Context(), id, adminID, reason); err != nil {
		if errors.Is(err, service.ErrActivityNotFound) {
			writeError(w, http.StatusNotFound, "activity not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to hide activity")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/activities/{id}/unhide
// Restores a previously hidden activity to the feed.
func (h *AdminActivityHandler) Unhide(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.AdminUnhide(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrActivityNotFound) {
			writeError(w, http.StatusNotFound, "activity not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unhide activity")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
