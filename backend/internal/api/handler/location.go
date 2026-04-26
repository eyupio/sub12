package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type LocationHandler struct {
	svc    *service.LocationService
	images *repository.ImageRepository
}

func NewLocation(svc *service.LocationService, images *repository.ImageRepository) *LocationHandler {
	return &LocationHandler{svc: svc, images: images}
}

// POST /api/v1/locations
func (h *LocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateLocationInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	loc, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidGear) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create location")
		return
	}
	writeJSON(w, http.StatusCreated, loc)
}

// GET /api/v1/locations
func (h *LocationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	locs, err := h.svc.List(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list locations")
		return
	}
	if locs == nil {
		locs = []*model.Location{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": locs})
}

// GET /api/v1/locations/{id}
func (h *LocationHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	loc, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "location not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get location")
		return
	}
	writeJSON(w, http.StatusOK, loc)
}

// PATCH /api/v1/locations/{id}
func (h *LocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdateLocationInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	loc, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "location not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update location")
		return
	}
	writeJSON(w, http.StatusOK, loc)
}

// DELETE /api/v1/locations/{id}
func (h *LocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "location not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete location")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/locations/{id}/image
func (h *LocationHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	locationID := chi.URLParam(r, "id")

	data, contentType, err := parseAndValidateImage(r, "image", 5<<20)
	if err != nil {
		if errors.Is(err, ErrFileTooLarge) {
			writeError(w, http.StatusBadRequest, "file too large (max 5MB)")
			return
		}
		if errors.Is(err, ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "missing image file")
			return
		}
		if errors.Is(err, ErrUnsupportedType) {
			writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read image")
		return
	}

	if _, err := h.svc.GetByID(r.Context(), locationID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "location not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify location")
		return
	}

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	imageURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	loc, err := h.svc.UpdateImageURL(r.Context(), locationID, userID, imageURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update location")
		return
	}
	writeJSON(w, http.StatusOK, loc)
}
