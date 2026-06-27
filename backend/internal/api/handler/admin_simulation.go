package handler

import (
	"errors"
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// runNowActions is the number of actions a manual "run now" performs.
const runNowActions = 10

type AdminSimulationHandler struct {
	svc *service.SimulationService
}

func NewAdminSimulation(svc *service.SimulationService) *AdminSimulationHandler {
	return &AdminSimulationHandler{svc: svc}
}

// GET /api/v1/admin/simulation/settings
func (h *AdminSimulationHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.GetSettings(r.Context())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "simulation settings not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch simulation settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/simulation/settings
func (h *AdminSimulationHandler) PatchSettings(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.UpsertSimulationSettingsInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.svc.UpdateSettings(r.Context(), &input, updatedBy)
	if err != nil {
		if errors.Is(err, service.ErrInvalidSimulationSettings) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update simulation settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// GET /api/v1/admin/simulation/status
func (h *AdminSimulationHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.svc.Status(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch simulation status")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// POST /api/v1/admin/simulation/run-now
func (h *AdminSimulationHandler) RunNow(w http.ResponseWriter, r *http.Request) {
	performed, err := h.svc.RunNow(r.Context(), runNowActions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to run simulation")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"performed": performed})
}
