package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type SocialHandler struct {
	svc *service.SocialService
}

func NewSocial(svc *service.SocialService) *SocialHandler {
	return &SocialHandler{svc: svc}
}

// POST /api/v1/users/{id}/follow
func (h *SocialHandler) Follow(w http.ResponseWriter, r *http.Request) {
	followerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	if err := h.svc.Follow(r.Context(), followerID, targetID); err != nil {
		if errors.Is(err, service.ErrCannotFollowSelf) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to follow user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"following": true})
}

// DELETE /api/v1/users/{id}/follow
func (h *SocialHandler) Unfollow(w http.ResponseWriter, r *http.Request) {
	followerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	if err := h.svc.Unfollow(r.Context(), followerID, targetID); err != nil {
		if errors.Is(err, service.ErrNotFollowing) {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unfollow user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"following": false})
}
