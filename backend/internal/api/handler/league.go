package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type LeagueHandler struct {
	svc *service.LeagueService
}

func NewLeague(svc *service.LeagueService) *LeagueHandler {
	return &LeagueHandler{svc: svc}
}

// POST /api/v1/leagues
func (h *LeagueHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreateLeagueInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	league, err := h.svc.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidLeague) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create league")
		return
	}

	writeJSON(w, http.StatusCreated, league)
}

// GET /api/v1/leagues
func (h *LeagueHandler) List(w http.ResponseWriter, r *http.Request) {
	leagues, err := h.svc.ListPublic(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list leagues")
		return
	}

	if leagues == nil {
		leagues = []*model.League{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": leagues})
}

// POST /api/v1/leagues/{id}/join
func (h *LeagueHandler) Join(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	err := h.svc.Join(r.Context(), leagueID, userID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		if errors.Is(err, service.ErrAlreadyMember) {
			writeError(w, http.StatusConflict, "already a member of this league")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to join league")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"joined": true})
}

// GET /api/v1/leagues/{id}/standings
func (h *LeagueHandler) Standings(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")

	standings, err := h.svc.Standings(r.Context(), leagueID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get standings")
		return
	}

	if standings == nil {
		standings = []*model.LeagueStanding{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": standings})
}
