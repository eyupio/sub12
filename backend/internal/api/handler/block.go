package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type BlockHandler struct {
	svc *service.BlockService
}

func NewBlock(svc *service.BlockService) *BlockHandler {
	return &BlockHandler{svc: svc}
}

// POST /api/v1/users/{id}/block
func (h *BlockHandler) Block(w http.ResponseWriter, r *http.Request) {
	blockerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	if err := h.svc.Block(r.Context(), blockerID, targetID); err != nil {
		if errors.Is(err, service.ErrCannotBlockSelf) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to block user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"blocked": true})
}

// DELETE /api/v1/users/{id}/block
func (h *BlockHandler) Unblock(w http.ResponseWriter, r *http.Request) {
	blockerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	targetID := chi.URLParam(r, "id")

	if err := h.svc.Unblock(r.Context(), blockerID, targetID); err != nil {
		if errors.Is(err, service.ErrNotBlocked) {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to unblock user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"blocked": false})
}

// GET /api/v1/users/me/blocks
func (h *BlockHandler) ListBlocked(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blocks, err := h.svc.ListBlocked(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list blocked users")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": blocks})
}
