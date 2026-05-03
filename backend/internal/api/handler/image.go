package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type ImageHandler struct {
	images *repository.ImageRepository
	log    zerolog.Logger
}

func NewImage(images *repository.ImageRepository, log zerolog.Logger) *ImageHandler {
	return &ImageHandler{images: images, log: log}
}

// POST /api/v1/images
func (h *ImageHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, contentType, err := parseAndValidateImage(r, "image", 10<<20)
	if err != nil {
		if errors.Is(err, ErrFileTooLarge) {
			writeError(w, http.StatusBadRequest, "file too large (max 10MB)")
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

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"id":  img.ID,
		"url": fmt.Sprintf("/api/v1/images/%s", img.ID),
	})
}

// GET /api/v1/images/{id}
func (h *ImageHandler) Serve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	img, err := h.images.GetByID(r.Context(), id)
	if err != nil {
		if err == repository.ErrNotFound {
			http.NotFound(w, r)
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch image")
		return
	}

	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", img.SizeBytes))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(img.Data); err != nil {
		// Headers are already on the wire; we can't change the status, but a
		// truncated write (typically a client disconnect or broken pipe) is
		// otherwise invisible to operators.
		h.log.Warn().Err(err).Str("image_id", id).Msg("partial image write")
	}
}
