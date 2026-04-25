package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type LikeHandler struct {
	svc *service.LikeService
}

func NewLike(svc *service.LikeService) *LikeHandler {
	return &LikeHandler{svc: svc}
}

// LikeScoreCard handles POST /api/v1/score-cards/{id}/like
func (h *LikeHandler) LikeScoreCard(w http.ResponseWriter, r *http.Request) {
	h.like(w, r, model.LikeTargetScoreCard)
}

// UnlikeScoreCard handles DELETE /api/v1/score-cards/{id}/like
func (h *LikeHandler) UnlikeScoreCard(w http.ResponseWriter, r *http.Request) {
	h.unlike(w, r, model.LikeTargetScoreCard)
}

// LikePost handles POST /api/v1/posts/{id}/like
func (h *LikeHandler) LikePost(w http.ResponseWriter, r *http.Request) {
	h.like(w, r, model.LikeTargetPost)
}

// UnlikePost handles DELETE /api/v1/posts/{id}/like
func (h *LikeHandler) UnlikePost(w http.ResponseWriter, r *http.Request) {
	h.unlike(w, r, model.LikeTargetPost)
}

// LikeComment handles POST /api/v1/comments/{id}/like
func (h *LikeHandler) LikeComment(w http.ResponseWriter, r *http.Request) {
	h.like(w, r, model.LikeTargetComment)
}

// UnlikeComment handles DELETE /api/v1/comments/{id}/like
func (h *LikeHandler) UnlikeComment(w http.ResponseWriter, r *http.Request) {
	h.unlike(w, r, model.LikeTargetComment)
}

// LikeActivity handles POST /api/v1/activities/{id}/like
func (h *LikeHandler) LikeActivity(w http.ResponseWriter, r *http.Request) {
	h.like(w, r, model.LikeTargetActivity)
}

// UnlikeActivity handles DELETE /api/v1/activities/{id}/like
func (h *LikeHandler) UnlikeActivity(w http.ResponseWriter, r *http.Request) {
	h.unlike(w, r, model.LikeTargetActivity)
}

func (h *LikeHandler) like(w http.ResponseWriter, r *http.Request, targetType string) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	created, err := h.svc.Like(r.Context(), userID, targetID, targetType)
	if err != nil {
		if errors.Is(err, service.ErrLikeTargetNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		if errors.Is(err, service.ErrInvalidLikeTarget) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to like")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"liked": true, "created": created})
}

func (h *LikeHandler) unlike(w http.ResponseWriter, r *http.Request, targetType string) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	removed, err := h.svc.Unlike(r.Context(), userID, targetID, targetType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unlike")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"liked": false, "removed": removed})
}
