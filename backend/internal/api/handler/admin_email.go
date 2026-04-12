package handler

import (
	"errors"
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminEmailHandler struct {
	svc *service.SMTPService
}

func NewAdminEmail(svc *service.SMTPService) *AdminEmailHandler {
	return &AdminEmailHandler{svc: svc}
}

// GET /api/v1/admin/email/settings
func (h *AdminEmailHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.GetSMTPSettings(r.Context())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "smtp settings not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch smtp settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/email/settings
func (h *AdminEmailHandler) PatchSettings(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.UpsertSMTPSettingsInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.svc.UpsertSMTPSettings(r.Context(), &input, updatedBy)
	if err != nil {
		if errors.Is(err, service.ErrInvalidSMTPSettings) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update smtp settings")
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

// POST /api/v1/admin/email/settings/test
func (h *AdminEmailHandler) TestSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.GetSMTPSettings(r.Context())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "smtp settings not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch smtp settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "smtp settings loaded",
		"host":    settings.Host,
		"port":    settings.Port,
	})
}
