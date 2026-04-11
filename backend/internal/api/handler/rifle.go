package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type RifleHandler struct {
	svc    *service.RifleService
	images *repository.ImageRepository
}

func NewRifle(svc *service.RifleService, images *repository.ImageRepository) *RifleHandler {
	return &RifleHandler{svc: svc, images: images}
}

// POST /api/v1/rifles
func (h *RifleHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateRifleInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rifle, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidGear) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create rifle")
		return
	}
	writeJSON(w, http.StatusCreated, rifle)
}

// GET /api/v1/rifles
func (h *RifleHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	activeOnly := r.URL.Query().Get("all") != "true"
	rifles, err := h.svc.List(r.Context(), userID, activeOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list rifles")
		return
	}
	if rifles == nil {
		rifles = []*model.Rifle{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rifles})
}

// PATCH /api/v1/rifles/{id}
func (h *RifleHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdateRifleInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rifle, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rifle not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update rifle")
		return
	}
	writeJSON(w, http.StatusOK, rifle)
}

// DELETE /api/v1/rifles/{id}
func (h *RifleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rifle not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete rifle")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/rifles/{id}/image
func (h *RifleHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rifleID := chi.URLParam(r, "id")

	r.Body = http.MaxBytesReader(w, r.Body, 5<<20)
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large (max 5MB)")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing image file")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	switch {
	case strings.HasPrefix(contentType, "image/jpeg"):
		contentType = "image/jpeg"
	case strings.HasPrefix(contentType, "image/png"):
		contentType = "image/png"
	case strings.HasPrefix(contentType, "image/webp"):
		contentType = "image/webp"
	default:
		writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
		return
	}

	// Verify ownership
	_, err = h.svc.GetByID(r.Context(), rifleID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rifle not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify rifle")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read image")
		return
	}

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	imageURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	rifle, err := h.svc.UpdateImageURL(r.Context(), rifleID, userID, imageURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update rifle")
		return
	}

	writeJSON(w, http.StatusOK, rifle)
}
