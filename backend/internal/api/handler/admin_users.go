package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminUsersHandler struct {
	svc *service.UserService
}

func NewAdminUsers(svc *service.UserService) *AdminUsersHandler {
	return &AdminUsersHandler{svc: svc}
}

// GET /api/v1/admin/users?limit=50&offset=0
func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	users, total, err := h.svc.AdminListUsers(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /api/v1/admin/users/{id}
func (h *AdminUsersHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.svc.AdminGetUser(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// PATCH /api/v1/admin/users/{id}/role
func (h *AdminUsersHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	callerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID := chi.URLParam(r, "id")

	var body struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.svc.AdminUpdateRole(r.Context(), callerID, targetID, body.Role)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidRole):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		case errors.Is(err, service.ErrCannotTargetSelf):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "user not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to update role")
		}
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// DELETE /api/v1/admin/users/{id}
func (h *AdminUsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	callerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID := chi.URLParam(r, "id")

	if err := h.svc.AdminDeleteUser(r.Context(), callerID, targetID); err != nil {
		switch {
		case errors.Is(err, service.ErrCannotTargetSelf):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "user not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to delete user")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
