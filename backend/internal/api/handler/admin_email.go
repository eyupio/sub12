package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminEmailHandler struct {
	smtpSvc     *service.SMTPService
	templateSvc *service.EmailTemplateService
}

func NewAdminEmail(smtpSvc *service.SMTPService, templateSvc *service.EmailTemplateService) *AdminEmailHandler {
	return &AdminEmailHandler{smtpSvc: smtpSvc, templateSvc: templateSvc}
}

// GET /api/v1/admin/email/settings
func (h *AdminEmailHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.smtpSvc.GetSMTPSettings(r.Context())
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

	settings, err := h.smtpSvc.UpsertSMTPSettings(r.Context(), &input, updatedBy)
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
	settings, err := h.smtpSvc.GetSMTPSettings(r.Context())
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

// GET /api/v1/admin/email/templates
func (h *AdminEmailHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.templateSvc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list email templates")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": templates})
}

// GET /api/v1/admin/email/templates/{key}
func (h *AdminEmailHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	tpl, err := h.templateSvc.GetByKey(r.Context(), key)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "email template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch email template")
		return
	}
	writeJSON(w, http.StatusOK, tpl)
}

// PATCH /api/v1/admin/email/templates/{key}
func (h *AdminEmailHandler) PatchTemplate(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	key := chi.URLParam(r, "key")

	var input model.UpdateEmailTemplateInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tpl, err := h.templateSvc.UpdateByKey(r.Context(), key, &input, updatedBy)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "email template not found")
		case errors.Is(err, service.ErrInvalidEmailTemplate):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update email template")
		}
		return
	}
	writeJSON(w, http.StatusOK, tpl)
}

// POST /api/v1/admin/email/templates/{key}/preview
func (h *AdminEmailHandler) PreviewTemplate(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	var input model.EmailTemplatePreviewInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.Payload == nil {
		input.Payload = map[string]any{}
	}

	rendered, err := h.templateSvc.Preview(r.Context(), key, input.Payload)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "email template not found")
		case errors.Is(err, service.ErrTemplateRender):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to preview email template")
		}
		return
	}

	writeJSON(w, http.StatusOK, rendered)
}
