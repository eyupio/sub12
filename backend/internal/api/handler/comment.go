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

// Create handles POST /api/v1/score-cards/{id}/comments
func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Create(r.Context(), targetID, "score_card", userID, input.Body, input.ParentID)
	if err != nil {
		h.handleCreateError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// List handles GET /api/v1/score-cards/{id}/comments
func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	comments, err := h.svc.ListByTarget(r.Context(), targetID, "score_card", viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

// ListReplies handles GET /api/v1/comments/{id}/replies
func (h *CommentHandler) ListReplies(w http.ResponseWriter, r *http.Request) {
	commentID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	replies, err := h.svc.ListReplies(r.Context(), commentID, viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list replies")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": replies})
}

// Reply handles POST /api/v1/comments/{id}/replies
func (h *CommentHandler) Reply(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	parentID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	parentComment, err := h.svc.GetByID(r.Context(), parentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "parent comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to find parent comment")
		return
	}

	comment, err := h.svc.Create(r.Context(), parentComment.TargetID, parentComment.TargetType, userID, input.Body, &parentID)
	if err != nil {
		h.handleCreateError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// Update handles PATCH /api/v1/score-cards/{id}/comments/{commentId}
// and PATCH /api/v1/comments/{id}
func (h *CommentHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	commentID := chi.URLParam(r, "commentId")
	if commentID == "" {
		commentID = chi.URLParam(r, "id")
	}

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

// Delete handles DELETE /api/v1/score-cards/{id}/comments/{commentId}
// and DELETE /api/v1/comments/{id}
func (h *CommentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	commentID := chi.URLParam(r, "commentId")
	if commentID == "" {
		commentID = chi.URLParam(r, "id")
	}

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

// CreateOnPost handles POST /api/v1/posts/{id}/comments
func (h *CommentHandler) CreateOnPost(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Create(r.Context(), targetID, "post", userID, input.Body, input.ParentID)
	if err != nil {
		h.handleCreateError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// ListOnPost handles GET /api/v1/posts/{id}/comments
func (h *CommentHandler) ListOnPost(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	comments, err := h.svc.ListByTarget(r.Context(), targetID, "post", viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

// CreateOnFeatureRequest handles POST /api/v1/feature-requests/{id}/comments
func (h *CommentHandler) CreateOnFeatureRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Create(r.Context(), targetID, "feature_request", userID, input.Body, input.ParentID)
	if err != nil {
		h.handleCreateError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// ListOnFeatureRequest handles GET /api/v1/feature-requests/{id}/comments
func (h *CommentHandler) ListOnFeatureRequest(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	comments, err := h.svc.ListByTarget(r.Context(), targetID, "feature_request", viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

// CreateOnActivity handles POST /api/v1/activities/{id}/comments
func (h *CommentHandler) CreateOnActivity(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	var input model.CreateCommentInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	comment, err := h.svc.Create(r.Context(), targetID, "activity", userID, input.Body, input.ParentID)
	if err != nil {
		h.handleCreateError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}

// ListOnActivity handles GET /api/v1/activities/{id}/comments
func (h *CommentHandler) ListOnActivity(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	comments, err := h.svc.ListByTarget(r.Context(), targetID, "activity", viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": comments})
}

// Flag handles POST /api/v1/comments/{id}/flag. League/club admins (or global
// admins) mark the comment as needing amendment.
func (h *CommentHandler) Flag(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	role, _ := middleware.UserRoleFromContext(r.Context())
	commentID := chi.URLParam(r, "id")

	var body struct {
		Reason string `json:"reason"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.FlagComment(r.Context(), userID, role, commentID, body.Reason); err != nil {
		if errors.Is(err, service.ErrCommentFlagReasonEmpty) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrCommentForbidden) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to flag comment")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"flagged": true})
}

// Unflag handles POST /api/v1/comments/{id}/unflag.
func (h *CommentHandler) Unflag(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	role, _ := middleware.UserRoleFromContext(r.Context())
	commentID := chi.URLParam(r, "id")

	if err := h.svc.UnflagComment(r.Context(), userID, role, commentID); err != nil {
		if errors.Is(err, service.ErrCommentForbidden) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "comment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unflag comment")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"flagged": false})
}

func (h *CommentHandler) handleCreateError(w http.ResponseWriter, err error) {
	if errors.Is(err, service.ErrCommentEmpty) || errors.Is(err, service.ErrCommentTooLong) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if errors.Is(err, service.ErrCommentDenied) {
		writeError(w, http.StatusForbidden, "you cannot comment on this content")
		return
	}
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "failed to create comment")
}
