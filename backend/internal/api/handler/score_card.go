package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ScoreCardHandler struct {
	svc *service.ScoreCardService
}

func NewScoreCard(svc *service.ScoreCardService) *ScoreCardHandler {
	return &ScoreCardHandler{svc: svc}
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
