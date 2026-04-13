package handler

import (
	"net/http"
	"strconv"

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

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	cursor := r.URL.Query().Get("cursor")

	filter := r.URL.Query().Get("filter")
	if filter == "" {
		filter = model.FeedForYou
	}

	req := model.FeedRequest{
		ViewerID: userID,
		Filter:   filter,
		LeagueID: r.URL.Query().Get("league_id"),
		ClubID:   r.URL.Query().Get("club_id"),
		Limit:    limit,
		Cursor:   cursor,
	}

	feed, err := h.svc.GetFeed(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, feed)
}
