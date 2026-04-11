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

type PelletHandler struct {
	svc    *service.PelletService
	images *repository.ImageRepository
}

func NewPellet(svc *service.PelletService, images *repository.ImageRepository) *PelletHandler {
	return &PelletHandler{svc: svc, images: images}
}

// POST /api/v1/pellets
func (h *PelletHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreatePelletInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pellet, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidGear) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create pellet")
		return
	}
	writeJSON(w, http.StatusCreated, pellet)
}

// GET /api/v1/pellets
func (h *PelletHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	activeOnly := r.URL.Query().Get("all") != "true"
	pellets, err := h.svc.List(r.Context(), userID, activeOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list pellets")
		return
	}
	if pellets == nil {
		pellets = []*model.Pellet{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": pellets})
}

// PATCH /api/v1/pellets/{id}
func (h *PelletHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdatePelletInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pellet, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update pellet")
		return
	}
	writeJSON(w, http.StatusOK, pellet)
}

// DELETE /api/v1/pellets/{id}
func (h *PelletHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete pellet")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/pellets/{id}/image
func (h *PelletHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	pelletID := chi.URLParam(r, "id")

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

	// Verify ownership
	_, err = h.svc.GetByID(r.Context(), pelletID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify pellet")
		return
	}

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	imageURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	pellet, err := h.svc.UpdateImageURL(r.Context(), pelletID, userID, imageURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update pellet")
		return
	}

	writeJSON(w, http.StatusOK, pellet)
}
