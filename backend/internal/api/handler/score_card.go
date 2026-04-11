package handler

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ScoreCardHandler struct {
	svc       *service.ScoreCardService
	uploadDir string
}

func NewScoreCard(svc *service.ScoreCardService, uploadDir string) *ScoreCardHandler {
	return &ScoreCardHandler{svc: svc, uploadDir: uploadDir}
}

// POST /api/v1/score-cards
func (h *ScoreCardHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreateScoreCardInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	card, err := h.svc.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCard) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to save score card")
		return
	}

	writeJSON(w, http.StatusCreated, card)
}

// GET /api/v1/score-cards
func (h *ScoreCardHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	cards, err := h.svc.ListByUser(r.Context(), userID, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list score cards")
		return
	}

	if cards == nil {
		cards = []*model.ScoreCardSummary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": cards})
}

// GET /api/v1/score-cards/{id}
func (h *ScoreCardHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	card, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch score card")
		return
	}

	writeJSON(w, http.StatusOK, card)
}

// POST /api/v1/score-cards/{id}/image
func (h *ScoreCardHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	cardID := chi.URLParam(r, "id")

	// Limit upload to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large (max 10MB)")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing image file")
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	var ext string
	switch {
	case strings.HasPrefix(contentType, "image/jpeg"):
		ext = ".jpg"
	case strings.HasPrefix(contentType, "image/png"):
		ext = ".png"
	case strings.HasPrefix(contentType, "image/webp"):
		ext = ".webp"
	default:
		writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
		return
	}

	// Verify the card exists and belongs to the user
	_, err = h.svc.GetByID(r.Context(), cardID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify score card")
		return
	}

	// Create directory if needed
	dir := filepath.Join(h.uploadDir, "score-cards")
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	// Write file
	filename := cardID + ext
	filePath := filepath.Join(dir, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(filePath)
		writeError(w, http.StatusInternalServerError, "failed to write image")
		return
	}

	// Update card_image_url in DB
	imageURL := "/uploads/score-cards/" + filename
	if err := h.svc.UpdateImageURL(r.Context(), cardID, userID, imageURL); err != nil {
		os.Remove(filePath)
		writeError(w, http.StatusInternalServerError, "failed to update score card")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"card_image_url": imageURL})
}
