package handler

import (
	"net/http"
	"strconv"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ActivityHandler struct {
	svc *service.ActivityService
}

func NewActivity(svc *service.ActivityService) *ActivityHandler {
	return &ActivityHandler{svc: svc}
}

// GET /api/v1/feed
func (h *ActivityHandler) GetFeed(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	cursor := r.URL.Query().Get("cursor")

	feed, err := h.svc.GetFeed(r.Context(), userID, limit, cursor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch feed")
		return
	}

	writeJSON(w, http.StatusOK, feed)
}
