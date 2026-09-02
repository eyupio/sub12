package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
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
	role, _ := middleware.UserRoleFromContext(r.Context())

	limit, _ := parsePagination(r, 20, 100)

	cursor := r.URL.Query().Get("cursor")

	filter := r.URL.Query().Get("filter")
	if filter == "" {
		filter = model.FeedForYou
	}

	req := model.FeedRequest{
		ViewerID:   userID,
		ViewerRole: role,
		Filter:     filter,
		LeagueID:   r.URL.Query().Get("league_id"),
		ClubID:     r.URL.Query().Get("club_id"),
		Limit:      limit,
		Cursor:     cursor,
	}

	feed, err := h.svc.GetFeed(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrFeedScopeRequired) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if errors.Is(err, service.ErrFeedNotMember) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load feed")
		return
	}

	writeJSON(w, http.StatusOK, feed)
}

// DELETE /api/v1/activities/{id}
// Permanently removes an auto-generated feed item owned by the authenticated user.
func (h *ActivityHandler) DeleteActivity(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteOwn(r.Context(), id, userID); err != nil {
		if errors.Is(err, service.ErrActivityNotFound) {
			writeError(w, http.StatusNotFound, "activity not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete activity")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
