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

type PostHandler struct {
	svc *service.PostService
}

func NewPost(svc *service.PostService) *PostHandler {
	return &PostHandler{svc: svc}
}

// Create handles POST /api/v1/posts
func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreatePostInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	post, err := h.svc.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrPostBodyEmpty) || errors.Is(err, service.ErrPostBodyTooLong) || errors.Is(err, service.ErrPostInvalidVisibility) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrPostDenied) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create post")
		return
	}

	writeJSON(w, http.StatusCreated, post)
}

// Get handles GET /api/v1/posts/{id}
func (h *PostHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	var vp *string
	if viewerID != "" {
		vp = &viewerID
	}

	post, err := h.svc.GetByID(r.Context(), id, vp)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get post")
		return
	}

	writeJSON(w, http.StatusOK, post)
}

// Update handles PATCH /api/v1/posts/{id}
func (h *PostHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var input struct {
		Body string `json:"body"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	post, err := h.svc.Update(r.Context(), id, userID, input.Body)
	if err != nil {
		if errors.Is(err, service.ErrPostBodyEmpty) || errors.Is(err, service.ErrPostBodyTooLong) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update post")
		return
	}

	writeJSON(w, http.StatusOK, post)
}

// Delete handles DELETE /api/v1/posts/{id}
func (h *PostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete post")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Share handles POST /api/v1/posts/share
func (h *PostHandler) Share(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.ShareInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	post, err := h.svc.Share(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrPostDenied) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to share")
		return
	}

	writeJSON(w, http.StatusCreated, post)
}

// ListByLeague handles GET /api/v1/leagues/{id}/posts
func (h *PostHandler) ListByLeague(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	limit, offset := parsePagination(r, 50, 100)

	posts, err := h.svc.ListByLeague(r.Context(), leagueID, viewerID, limit, offset)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": posts})
}

// ListByClub handles GET /api/v1/clubs/{id}/posts
func (h *PostHandler) ListByClub(w http.ResponseWriter, r *http.Request) {
	clubID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	limit, offset := parsePagination(r, 50, 100)

	posts, err := h.svc.ListByClub(r.Context(), clubID, viewerID, limit, offset)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": posts})
}

// Flag handles POST /api/v1/posts/{id}/flag. League/club admins (or global
// admins) mark the post as needing amendment.
func (h *PostHandler) Flag(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	role, _ := middleware.UserRoleFromContext(r.Context())
	postID := chi.URLParam(r, "id")

	var body struct {
		Reason string `json:"reason"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.FlagPost(r.Context(), userID, role, postID, body.Reason); err != nil {
		if errors.Is(err, service.ErrPostFlagReasonEmpty) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrPostForbidden) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to flag post")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"flagged": true})
}

// Unflag handles POST /api/v1/posts/{id}/unflag.
func (h *PostHandler) Unflag(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	role, _ := middleware.UserRoleFromContext(r.Context())
	postID := chi.URLParam(r, "id")

	if err := h.svc.UnflagPost(r.Context(), userID, role, postID); err != nil {
		if errors.Is(err, service.ErrPostForbidden) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "post not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unflag post")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"flagged": false})
}

