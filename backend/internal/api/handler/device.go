package handler

import (
	"errors"
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type DeviceHandler struct {
	svc *service.DeviceService
}

func NewDevice(svc *service.DeviceService) *DeviceHandler {
	return &DeviceHandler{svc: svc}
}

// POST /api/v1/devices — register or refresh the caller's push token.
func (h *DeviceHandler) Register(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var in model.RegisterDeviceInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.Register(r.Context(), userID, &in); err != nil {
		if errors.Is(err, service.ErrInvalidDeviceToken) || errors.Is(err, service.ErrInvalidDevicePlatform) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to register device")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"registered": true})
}

// DELETE /api/v1/devices — unregister a push token (e.g. on logout).
func (h *DeviceHandler) Unregister(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var in model.RegisterDeviceInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.Unregister(r.Context(), userID, in.Token); err != nil {
		if errors.Is(err, service.ErrInvalidDeviceToken) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "device token not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unregister device")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"registered": false})
}
