package handler

import (
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type GalleryHandler struct {
	svc *service.GalleryService
}

func NewGallery(svc *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{svc: svc}
}

// GET /api/v1/users/me/gallery
func (h *GalleryHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	items, err := h.svc.ListForUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load gallery")
		return
	}
	if items == nil {
		items = []*model.GalleryItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
