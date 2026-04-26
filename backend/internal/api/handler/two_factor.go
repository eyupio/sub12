package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type TwoFactorHandler struct {
	tf *service.TwoFactorService
}

func NewTwoFactor(tf *service.TwoFactorService) *TwoFactorHandler {
	return &TwoFactorHandler{tf: tf}
}

// GET /api/v1/users/me/2fa/status
func (h *TwoFactorHandler) Status(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	status, err := h.tf.Status(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load 2fa status")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// POST /api/v1/users/me/2fa/enroll/begin
func (h *TwoFactorHandler) EnrollBegin(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	begin, err := h.tf.BeginEnroll(r.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTOTPAlreadyEnrolled):
			writeError(w, http.StatusConflict, "two-factor authentication is already enabled")
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "user not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to start enrollment")
		}
		return
	}
	writeJSON(w, http.StatusOK, begin)
}

// POST /api/v1/users/me/2fa/enroll/confirm
func (h *TwoFactorHandler) EnrollConfirm(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}
	codes, err := h.tf.ConfirmEnroll(r.Context(), userID, body.Code)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPendingEnrollExpired):
			writeError(w, http.StatusBadRequest, "enrollment expired, please start again")
		case errors.Is(err, service.ErrInvalidTOTP):
			writeError(w, http.StatusUnauthorized, "invalid verification code")
		default:
			writeError(w, http.StatusInternalServerError, "failed to enable two-factor authentication")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backup_codes": codes})
}

// POST /api/v1/users/me/2fa/disable
func (h *TwoFactorHandler) Disable(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Password == "" && body.Code == "" {
		writeError(w, http.StatusBadRequest, "password or current code is required")
		return
	}
	if err := h.tf.Disable(r.Context(), userID, body.Password, body.Code); err != nil {
		switch {
		case errors.Is(err, service.ErrTOTPReauthInvalid):
			writeError(w, http.StatusUnauthorized, "invalid password or verification code")
		case errors.Is(err, service.ErrTOTPReauthRequired):
			writeError(w, http.StatusBadRequest, "password or current code is required")
		default:
			writeError(w, http.StatusInternalServerError, "failed to disable two-factor authentication")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/users/me/2fa/backup-codes/regenerate
func (h *TwoFactorHandler) RegenerateBackupCodes(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}
	codes, err := h.tf.RegenerateBackupCodes(r.Context(), userID, body.Code)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTOTPNotEnrolled):
			writeError(w, http.StatusBadRequest, "two-factor authentication is not enabled")
		case errors.Is(err, service.ErrInvalidTOTP):
			writeError(w, http.StatusUnauthorized, "invalid verification code")
		default:
			writeError(w, http.StatusInternalServerError, "failed to regenerate backup codes")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backup_codes": codes})
}
