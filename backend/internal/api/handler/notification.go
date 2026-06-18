package handler

import (
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type NotificationHandler struct {
	svc *service.NotificationService
}

func NewNotification(svc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

// GET /api/v1/notifications?cursor=&limit=20
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, _ := parsePagination(r, 20, 100)
	cursor := r.URL.Query().Get("cursor")
	items, next, err := h.svc.List(r.Context(), userID, limit, cursor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "cursor": next})
}

// GET /api/v1/notifications/unread-count
func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	count, err := h.svc.UnreadCount(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get unread count")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": count})
}

// POST /api/v1/notifications/read - body { ids?: string[] }. Empty/missing ids = mark all.
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in struct {
		IDs []string `json:"ids,omitempty"`
	}
	if r.ContentLength > 0 {
		if err := decodeJSON(r, &in); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	if err := h.svc.MarkRead(r.Context(), userID, in.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/notifications/preferences
func (h *NotificationHandler) GetPreferences(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	prefs, err := h.svc.GetPreferences(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get preferences")
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

// PATCH /api/v1/notifications/preferences
func (h *NotificationHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.UpdateNotificationPrefsInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	prefs, err := h.svc.UpdatePreferences(r.Context(), userID, &in)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update preferences")
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}
