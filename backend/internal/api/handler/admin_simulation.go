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

// runNowDefaultActions is the number of actions a manual "run now" performs
// when the request omits a count.
const runNowDefaultActions = 10

// runNowMaxActions caps how many actions a single manual run can request.
const runNowMaxActions = 100

// personaAvatarMaxBytes is the max accepted avatar upload size for a persona.
const personaAvatarMaxBytes = 5 << 20

type AdminSimulationHandler struct {
	svc    *service.SimulationService
	images *repository.ImageRepository
}

func NewAdminSimulation(svc *service.SimulationService, images *repository.ImageRepository) *AdminSimulationHandler {
	return &AdminSimulationHandler{svc: svc, images: images}
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
// Body: {"actions": 10} (optional; defaults to 10, capped at 100)
func (h *AdminSimulationHandler) RunNow(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	n := runNowDefaultActions
	var body struct {
		Actions *int `json:"actions"`
	}
	if err := decodeJSON(r, &body); err == nil && body.Actions != nil {
		n = *body.Actions
	}
	if n < 1 {
		n = 1
	}
	if n > runNowMaxActions {
		n = runNowMaxActions
	}

	performed, counts, err := h.svc.RunNow(r.Context(), n, actorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to run simulation")
		return
	}
	if counts == nil {
		counts = map[string]int{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"performed": performed,
		"counts":    counts,
	})
}

// GET /api/v1/admin/simulation/personas?limit=50&offset=0
func (h *AdminSimulationHandler) ListPersonas(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r, 50, 200)
	personas, total, err := h.svc.ListPersonas(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list simulated personas")
		return
	}
	if personas == nil {
		personas = []*model.SimulatedPersona{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  personas,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// DELETE /api/v1/admin/simulation/personas/{id}
func (h *AdminSimulationHandler) DeletePersona(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}
	if err := h.svc.DeletePersona(r.Context(), id, actorID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "simulated persona not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete simulated persona")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/admin/simulation/personas  (full purge)
func (h *AdminSimulationHandler) PurgeAll(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	n, err := h.svc.PurgeAll(r.Context(), actorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to purge simulated accounts")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
}

// POST /api/v1/admin/simulation/cleanup
// Trims the simulated roster down to persona_count (or an explicit ?target=).
func (h *AdminSimulationHandler) Cleanup(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	target := 0
	if v := r.URL.Query().Get("target"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			target = n
		}
	}
	if target == 0 {
		settings, err := h.svc.GetSettings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load simulation settings")
			return
		}
		target = settings.PersonaCount
	}
	deleted, err := h.svc.Cleanup(r.Context(), target, actorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cleanup simulated accounts")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted, "target": target})
}

// GET /api/v1/admin/simulation/audit?limit=50&offset=0
func (h *AdminSimulationHandler) ListAudit(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r, 50, 200)
	entries, total, err := h.svc.ListAudit(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list simulation audit log")
		return
	}
	if entries == nil {
		entries = []*model.SimulationAudit{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  entries,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// PATCH /api/v1/admin/simulation/personas/{id}
// Updates a simulated account's profile details (display_name, bio, location, club).
func (h *AdminSimulationHandler) PatchPersona(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}

	var input model.UpdateSimulatedPersonaInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updated, err := h.svc.UpdatePersona(r.Context(), id, actorID, &input)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "simulated persona not found")
		case errors.Is(err, service.ErrInvalidSimulationSettings):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update simulated persona")
		}
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// POST /api/v1/admin/simulation/personas/{id}/avatar
// Uploads an avatar image for a simulated account (multipart form, field "image").
func (h *AdminSimulationHandler) UploadPersonaAvatar(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}

	data, contentType, err := parseAndValidateImage(r, "image", personaAvatarMaxBytes)
	if err != nil {
		switch {
		case errors.Is(err, ErrFileTooLarge):
			writeError(w, http.StatusBadRequest, "file too large (max 5MB)")
		case errors.Is(err, ErrMissingFile):
			writeError(w, http.StatusBadRequest, "missing image file")
		case errors.Is(err, ErrUnsupportedType):
			writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
		default:
			writeError(w, http.StatusInternalServerError, "failed to read image")
		}
		return
	}

	// Store the image owned by the simulated account.
	img, err := h.images.Create(r.Context(), id, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	avatarURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	updated, err := h.svc.SetPersonaAvatar(r.Context(), id, avatarURL, actorID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "simulated persona not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update avatar")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/admin/simulation/personas/{id}/avatar
func (h *AdminSimulationHandler) DeletePersonaAvatar(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}

	updated, err := h.svc.RemovePersonaAvatar(r.Context(), id, actorID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "simulated persona not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to remove avatar")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// POST /api/v1/admin/simulation/personas/{id}/join-league
// Body: {"league_id": "..."}
func (h *AdminSimulationHandler) JoinPersonaToLeague(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	personaID := chi.URLParam(r, "id")
	if personaID == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}
	var body struct {
		LeagueID string `json:"league_id"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.LeagueID == "" {
		writeError(w, http.StatusBadRequest, "league_id is required")
		return
	}
	if err := h.svc.JoinPersonaToLeague(r.Context(), personaID, body.LeagueID, actorID); err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "persona or league not found")
		case errors.Is(err, service.ErrLeagueNotFound):
			writeError(w, http.StatusNotFound, "league not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to join persona to league")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/v1/admin/simulation/personas/{id}/join-club
// Body: {"club_id": "..."}
func (h *AdminSimulationHandler) JoinPersonaToClub(w http.ResponseWriter, r *http.Request) {
	actorID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	personaID := chi.URLParam(r, "id")
	if personaID == "" {
		writeError(w, http.StatusBadRequest, "missing persona id")
		return
	}
	var body struct {
		ClubID string `json:"club_id"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ClubID == "" {
		writeError(w, http.StatusBadRequest, "club_id is required")
		return
	}
	if err := h.svc.JoinPersonaToClub(r.Context(), personaID, body.ClubID, actorID); err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "persona or club not found")
		case errors.Is(err, service.ErrClubNotFound):
			writeError(w, http.StatusNotFound, "club not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to join persona to club")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
