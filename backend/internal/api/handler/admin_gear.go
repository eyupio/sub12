package handler

import (
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminGearHandler struct {
	svc *service.AdminGearService
}

func NewAdminGear(svc *service.AdminGearService) *AdminGearHandler {
	return &AdminGearHandler{svc: svc}
}

// GET /api/v1/admin/gear/stats
func (h *AdminGearHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetStats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch gear stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// GET /api/v1/admin/gear/models?kind=rifle|pellet&q=&sort=&limit=&offset=
func (h *AdminGearHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r, 25, 100)
	q := r.URL.Query()

	items, total, err := h.svc.ListModels(r.Context(), q.Get("kind"), q.Get("q"), q.Get("sort"), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list gear models")
		return
	}
	if items == nil {
		items = []*model.AdminGearModel{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
}

// GET /api/v1/admin/gear/model?kind=rifle|pellet&make=&model=
func (h *AdminGearHandler) ModelDetail(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	make, modelName := q.Get("make"), q.Get("model")
	if make == "" || modelName == "" {
		writeError(w, http.StatusBadRequest, "make and model are required")
		return
	}

	detail, err := h.svc.GetModelDetail(r.Context(), q.Get("kind"), make, modelName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch gear model detail")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
