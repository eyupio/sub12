package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type GearShowcaseHandler struct {
	svc *service.GearShowcaseService
}

func NewGearShowcase(svc *service.GearShowcaseService) *GearShowcaseHandler {
	return &GearShowcaseHandler{svc: svc}
}

// GET /api/v1/rifles/{id}/showcase
func (h *GearShowcaseHandler) Rifle(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	showcase, err := h.svc.GetRifleShowcase(r.Context(), chi.URLParam(r, "id"), userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rifle not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to build rifle showcase")
		return
	}
	writeJSON(w, http.StatusOK, showcase)
}

// GET /api/v1/pellets/{id}/showcase
func (h *GearShowcaseHandler) Pellet(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	showcase, err := h.svc.GetPelletShowcase(r.Context(), chi.URLParam(r, "id"), userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to build pellet showcase")
		return
	}
	writeJSON(w, http.StatusOK, showcase)
}

// PATCH /api/v1/users/me/gear-comparison
// Flips every rifle and pellet the caller owns in or out of public comparison.
func (h *GearShowcaseHandler) SetOptInAll(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var in struct {
		OptIn *bool `json:"opt_in"`
	}
	if err := decodeJSON(r, &in); err != nil || in.OptIn == nil {
		writeError(w, http.StatusBadRequest, "opt_in is required")
		return
	}

	rifles, pellets, err := h.svc.SetComparisonOptInAll(r.Context(), userID, *in.OptIn)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update gear comparison")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"opt_in":          *in.OptIn,
		"rifles_updated":  rifles,
		"pellets_updated": pellets,
	})
}
