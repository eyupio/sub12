package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminLeaguesHandler struct {
	svc *service.LeagueService
}

func NewAdminLeagues(svc *service.LeagueService) *AdminLeaguesHandler {
	return &AdminLeaguesHandler{svc: svc}
}

// GET /api/v1/admin/leagues
func (h *AdminLeaguesHandler) List(w http.ResponseWriter, r *http.Request) {
	leagues, err := h.svc.AdminListLeagues(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list leagues")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": leagues})
}

// GET /api/v1/admin/leagues/{id}
func (h *AdminLeaguesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	league, err := h.svc.AdminGetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get league")
		return
	}
	writeJSON(w, http.StatusOK, league)
}

// PATCH /api/v1/admin/leagues/{id}
func (h *AdminLeaguesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var in model.UpdateLeagueInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	league, err := h.svc.AdminUpdateLeague(r.Context(), id, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrLeagueNotFound):
			writeError(w, http.StatusNotFound, "league not found")
		case errors.Is(err, service.ErrInvalidLeague):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update league")
		}
		return
	}
	writeJSON(w, http.StatusOK, league)
}

// DELETE /api/v1/admin/leagues/{id}
func (h *AdminLeaguesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.AdminDeleteLeague(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete league")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/admin/leagues/{id}/members
func (h *AdminLeaguesHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	members, err := h.svc.ListMembers(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

// DELETE /api/v1/admin/leagues/{id}/members/{userId}
func (h *AdminLeaguesHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	if err := h.svc.AdminRemoveMember(r.Context(), leagueID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
