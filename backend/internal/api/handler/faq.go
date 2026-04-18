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

type FAQHandler struct {
	svc *service.FAQService
}

func NewFAQ(svc *service.FAQService) *FAQHandler {
	return &FAQHandler{svc: svc}
}

// GET /api/v1/faqs — public list of published FAQs.
func (h *FAQHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.List(r.Context(), true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list faqs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/faqs/{slug} — public single FAQ.
func (h *FAQHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	item, err := h.svc.GetBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "faq not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch faq")
		return
	}
	if !item.IsPublished {
		writeError(w, http.StatusNotFound, "faq not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// GET /api/v1/admin/faqs — admin list of all FAQs.
func (h *FAQHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.List(r.Context(), false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list faqs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/admin/faqs/{id}
func (h *FAQHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	item, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "faq not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch faq")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// POST /api/v1/admin/faqs
func (h *FAQHandler) AdminCreate(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreateFAQInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	item, err := h.svc.Create(r.Context(), &input, updatedBy)
	if err != nil {
		if errors.Is(err, service.ErrInvalidFAQ) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create faq")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// PATCH /api/v1/admin/faqs/{id}
func (h *FAQHandler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")

	var input model.UpdateFAQInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	item, err := h.svc.Update(r.Context(), id, &input, updatedBy)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "faq not found")
		case errors.Is(err, service.ErrInvalidFAQ):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update faq")
		}
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// DELETE /api/v1/admin/faqs/{id}
func (h *FAQHandler) AdminDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "faq not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete faq")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
