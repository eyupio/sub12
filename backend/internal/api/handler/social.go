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

	followed, requested, err := h.svc.Follow(r.Context(), followerID, targetID)
	if err != nil {
		if errors.Is(err, service.ErrCannotFollowSelf) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrBlockedUser) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to follow user")
		return
	}

	if requested {
		writeJSON(w, http.StatusOK, map[string]string{"status": "requested"})
		return
	}
	if followed {
		writeJSON(w, http.StatusOK, map[string]bool{"following": true})
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

// POST /api/v1/users/me/unfollow-batch
func (h *SocialHandler) BulkUnfollow(w http.ResponseWriter, r *http.Request) {
	followerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(input.UserIDs) == 0 {
		writeError(w, http.StatusBadRequest, "user_ids must not be empty")
		return
	}
	if len(input.UserIDs) > 200 {
		writeError(w, http.StatusUnprocessableEntity, "cannot unfollow more than 200 users at once")
		return
	}

	unfollowed, err := h.svc.BulkUnfollow(r.Context(), followerID, input.UserIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unfollow users")
		return
	}

	writeJSON(w, http.StatusOK, map[string]int{"unfollowed": unfollowed})
}

// GET /api/v1/users/{id}/followers
func (h *SocialHandler) ListFollowers(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	profileID := chi.URLParam(r, "id")
	limit, offset := parsePagination(r, 50, 100)

	items, err := h.svc.ListFollowers(r.Context(), profileID, viewerID, limit, offset)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if errors.Is(err, service.ErrAccessDenied) {
			writeError(w, http.StatusForbidden, "this profile is private")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list followers")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/users/{id}/following
func (h *SocialHandler) ListFollowing(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	profileID := chi.URLParam(r, "id")
	limit, offset := parsePagination(r, 50, 100)

	items, err := h.svc.ListFollowing(r.Context(), profileID, viewerID, limit, offset)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if errors.Is(err, service.ErrAccessDenied) {
			writeError(w, http.StatusForbidden, "this profile is private")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list following")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/users/me/follow-requests
func (h *SocialHandler) ListFollowRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	reqs, err := h.svc.ListFollowRequests(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list follow requests")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": reqs})
}

// POST /api/v1/users/me/follow-requests/{id}/decide
func (h *SocialHandler) DecideFollowRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	requestID := chi.URLParam(r, "id")

	var input struct {
		Decision string `json:"decision"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fr, err := h.svc.DecideFollowRequest(r.Context(), requestID, userID, input.Decision)
	if err != nil {
		if errors.Is(err, service.ErrInvalidDecision) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "follow request not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to decide follow request")
		return
	}

	writeJSON(w, http.StatusOK, fr)
}

