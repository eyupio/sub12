package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// siteLogoMaxBytes is the accepted upload size for a deployment's logo. It is
// drawn at a couple of hundred pixels; anything larger is a mistake.
const siteLogoMaxBytes = 2 << 20

type SiteSettingsHandler struct {
	svc    *service.SiteSettingsService
	images *repository.ImageRepository
}

func NewSiteSettings(svc *service.SiteSettingsService, images *repository.ImageRepository) *SiteSettingsHandler {
	return &SiteSettingsHandler{svc: svc, images: images}
}

// GET /api/v1/site/settings — public branding for the app shell.
func (h *SiteSettingsHandler) Public(w http.ResponseWriter, r *http.Request) {
	// Branding changes rarely and every visitor fetches it before first
	// paint, but it must not be cached so long that an operator who has just
	// rebranded thinks the change was lost.
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, h.svc.Public(r.Context()))
}

// GET /api/v1/setup/status — is the first-run wizard still open?
func (h *SiteSettingsHandler) SetupStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.svc.Status(r.Context()))
}

// POST /api/v1/setup — run the first-run wizard.
//
// Unauthenticated by necessity: on a fresh deployment there is nobody to
// authenticate as. It is safe because it can only ever succeed once — see
// SiteSettingsService.CompleteSetup — and because it is rate-limited per IP in
// the router alongside the other password-bearing endpoints.
func (h *SiteSettingsHandler) CompleteSetup(w http.ResponseWriter, r *http.Request) {
	var input model.SetupInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.svc.CompleteSetup(r.Context(), &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrSetupComplete):
			writeError(w, http.StatusConflict, "this deployment has already been set up — sign in instead")
		case errors.Is(err, model.ErrInvalidSiteSettings):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "setup failed")
		}
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// RegistrationGate refuses sign-ups on a deployment whose operator has closed
// them. Hiding the link on the sign-in screen is presentation; this is the
// rule. A club running an invite-only site would otherwise find that anyone
// who guessed /register — or posted to the endpoint directly — still got an
// account, which is exactly the setting they thought they had turned off.
func (h *SiteSettingsHandler) RegistrationGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !h.svc.RegistrationOpen(r.Context()) {
			writeError(w, http.StatusForbidden, "registration is closed on this deployment — ask an administrator for an account")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GET /api/v1/admin/site-settings
func (h *SiteSettingsHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.Get(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load site settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/site-settings
func (h *SiteSettingsHandler) AdminPatch(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.UpdateSiteSettingsInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.svc.Update(r.Context(), &input, updatedBy)
	if err != nil {
		if errors.Is(err, model.ErrInvalidSiteSettings) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update site settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// POST /api/v1/admin/site-settings/logo (multipart, field "image")
func (h *SiteSettingsHandler) AdminUploadLogo(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, contentType, err := parseAndValidateImage(r, "image", siteLogoMaxBytes)
	if err != nil {
		switch {
		case errors.Is(err, ErrFileTooLarge):
			writeError(w, http.StatusBadRequest, "file too large (max 2MB)")
		case errors.Is(err, ErrMissingFile):
			writeError(w, http.StatusBadRequest, "missing image file")
		case errors.Is(err, ErrUnsupportedType):
			writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
		default:
			writeError(w, http.StatusInternalServerError, "failed to read image")
		}
		return
	}

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	settings, err := h.svc.SetLogo(r.Context(), fmt.Sprintf("/api/v1/images/%s", img.ID), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save logo")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// DELETE /api/v1/admin/site-settings/logo
func (h *SiteSettingsHandler) AdminDeleteLogo(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	settings, err := h.svc.SetLogo(r.Context(), "", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove logo")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}
