package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type CommentHandler struct {
	svc *service.CommentService
}

func NewComment(svc *service.CommentService) *CommentHandler {
	return &CommentHandler{svc: svc}
}

// POST /api/v1/score-cards/{id}/comments
func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	cardID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Create(r.Context(), cardID, userID, input.Body)
	if err != nil {
		if errors.Is(err, service.ErrCommentEmpty) || errors.Is(err, service.ErrCommentTooLong) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrCommentDenied) {
			writeError(w, http.StatusForbidden, "you cannot comment on this score card")
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create comment")
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// GET /api/v1/score-cards/{id}/comments
func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")

	comments, err := h.svc.List(r.Context(), cardID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

// PATCH /api/v1/score-cards/{id}/comments/{commentId}
func (h *CommentHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	commentID := chi.URLParam(r, "commentId")

	var input model.UpdateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Update(r.Context(), commentID, userID, input.Body)
	if err != nil {
		if errors.Is(err, service.ErrCommentEmpty) || errors.Is(err, service.ErrCommentTooLong) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update comment")
		return
	}

	writeJSON(w, http.StatusOK, comment)
}

// DELETE /api/v1/score-cards/{id}/comments/{commentId}
func (h *CommentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	commentID := chi.URLParam(r, "commentId")

	if err := h.svc.Delete(r.Context(), commentID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete comment")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
