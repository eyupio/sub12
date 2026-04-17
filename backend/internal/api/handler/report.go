package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ReportHandler struct {
	svc *service.ModerationService
}

func NewReport(svc *service.ModerationService) *ReportHandler {
	return &ReportHandler{svc: svc}
}

// POST /api/v1/reports
func (h *ReportHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateReportInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	report, err := h.svc.CreateReport(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrReportInvalidTarget) || errors.Is(err, service.ErrReportReasonEmpty) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create report")
		return
	}
	writeJSON(w, http.StatusCreated, report)
}

// GET /api/v1/admin/reports?status=open&limit=50
func (h *ReportHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	items, err := h.svc.List(r.Context(), status, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list reports")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/admin/reports/{id}/decide
func (h *ReportHandler) AdminDecide(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	reportID := chi.URLParam(r, "id")
	var in model.DecideReportInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	report, err := h.svc.Decide(r.Context(), reportID, adminID, &in)
	if err != nil {
		if errors.Is(err, service.ErrReportInvalidAction) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrReportAlreadyDecided) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "report not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to decide report")
		return
	}
	writeJSON(w, http.StatusOK, report)
}
