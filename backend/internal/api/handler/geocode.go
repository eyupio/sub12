package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/service"
)

type GeocodeHandler struct {
	svc *service.GeocodeService
}

func NewGeocode(svc *service.GeocodeService) *GeocodeHandler {
	return &GeocodeHandler{svc: svc}
}

// GET /api/v1/geo/reverse?lat=&lng=
// Returns the place name for a coordinate. 204 means "nowhere named here" —
// including when no geocoder is configured — and the caller falls back to
// showing the coordinates.
func (h *GeocodeHandler) Reverse(w http.ResponseWriter, r *http.Request) {
	lat, latErr := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("lat")), 64)
	lng, lngErr := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("lng")), 64)
	if latErr != nil || lngErr != nil {
		writeError(w, http.StatusBadRequest, "lat and lng are required")
		return
	}

	place, err := h.svc.Reverse(r.Context(), lat, lng)
	if err != nil {
		if errors.Is(err, service.ErrGeocodeDisabled) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if place == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, place)
}
