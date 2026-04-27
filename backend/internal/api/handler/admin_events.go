package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminEventsHandler struct {
	svc *service.EventService
}

func NewAdminEvents(svc *service.EventService) *AdminEventsHandler {
	return &AdminEventsHandler{svc: svc}
}

// GET /api/v1/admin/events
func (h *AdminEventsHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.AdminListEvents(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	if items == nil {
		items = []*repository.AdminEventRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// DELETE /api/v1/admin/events/{id}
func (h *AdminEventsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		writeInvalidUUIDError(w, "event id")
		return
	}
	if err := h.svc.AdminDeleteEvent(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEventNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete event")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
