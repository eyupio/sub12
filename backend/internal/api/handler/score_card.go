package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ScoreCardHandler struct {
	svc    *service.ScoreCardService
	images *repository.ImageRepository
}

func NewScoreCard(svc *service.ScoreCardService, images *repository.ImageRepository) *ScoreCardHandler {
	return &ScoreCardHandler{svc: svc, images: images}
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
	scope := r.URL.Query().Get("scope")

	cards, err := h.svc.ListByUser(r.Context(), userID, limit, offset, scope)
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

	// Store image in database
	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	// Update card_image_url in DB
	imageURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	if err := h.svc.UpdateImageURL(r.Context(), cardID, userID, imageURL); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update score card")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"card_image_url": imageURL})
}

// PATCH /api/v1/score-cards/{id}
func (h *ScoreCardHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var input model.UpdateScoreCardInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	card, err := h.svc.Update(r.Context(), id, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCard) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update score card")
		return
	}

	writeJSON(w, http.StatusOK, card)
}
