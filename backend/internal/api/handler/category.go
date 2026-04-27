package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type CategoryHandler struct {
	svc *service.CategoryService
}

func NewCategory(svc *service.CategoryService) *CategoryHandler {
	return &CategoryHandler{svc: svc}
}

// GET /api/v1/categories — public; used by the event-create form to populate
// its multiselect of platform-wide participant categories.
func (h *CategoryHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListPublic(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list categories")
		return
	}
	if items == nil {
		items = []*model.Category{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/admin/categories
func (h *CategoryHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.AdminList(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list categories")
		return
	}
	if items == nil {
		items = []*model.Category{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/admin/categories
func (h *CategoryHandler) AdminCreate(w http.ResponseWriter, r *http.Request) {
	var in model.CreateCategoryInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cat, err := h.svc.Create(r.Context(), &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCategory) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrCategoryConflict) {
			writeError(w, http.StatusConflict, "category slug already in use")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create category")
		return
	}
	writeJSON(w, http.StatusCreated, cat)
}

// PATCH /api/v1/admin/categories/{id}
func (h *CategoryHandler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		writeInvalidUUIDError(w, "category id")
		return
	}
	var in model.UpdateCategoryInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cat, err := h.svc.Update(r.Context(), id, &in)
	if err != nil {
		if errors.Is(err, service.ErrCategoryNotFound) {
			writeError(w, http.StatusNotFound, "category not found")
			return
		}
		if errors.Is(err, service.ErrInvalidCategory) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrCategoryConflict) {
			writeError(w, http.StatusConflict, "category slug already in use")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update category")
		return
	}
	writeJSON(w, http.StatusOK, cat)
}

// DELETE /api/v1/admin/categories/{id}
func (h *CategoryHandler) AdminDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		writeInvalidUUIDError(w, "category id")
		return
	}
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrCategoryNotFound) {
			writeError(w, http.StatusNotFound, "category not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
