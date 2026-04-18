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
		switch {
		case errors.Is(err, service.ErrReportInvalidTarget),
			errors.Is(err, service.ErrReportReasonEmpty),
			errors.Is(err, service.ErrReportContextMissing):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		case errors.Is(err, service.ErrReportSelfReport):
			writeError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, service.ErrReportTargetMissing):
			writeError(w, http.StatusNotFound, err.Error())
			return
		case errors.Is(err, service.ErrReporterNotMember):
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create report")
		return
	}
	writeJSON(w, http.StatusCreated, report)
}

// GET /api/v1/admin/reports?status=open&limit=50
func (h *ReportHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	status, limit := parseListParams(r)
	items, err := h.svc.ListAll(r.Context(), status, limit)
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
		h.writeDecideError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

// GET /api/v1/leagues/{id}/reports?status=open&limit=50
func (h *ReportHandler) ListForLeague(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	leagueID := chi.URLParam(r, "id")
	status, limit := parseListParams(r)
	items, err := h.svc.ListForLeague(r.Context(), leagueID, adminID, status, limit)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list league reports")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/leagues/{id}/reports/{reportId}/decide
func (h *ReportHandler) DecideForLeague(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	leagueID := chi.URLParam(r, "id")
	reportID := chi.URLParam(r, "reportId")
	var in model.DecideReportInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	report, err := h.svc.DecideForLeague(r.Context(), leagueID, reportID, adminID, &in)
	if err != nil {
		h.writeDecideError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

// GET /api/v1/clubs/{id}/reports?status=open&limit=50
func (h *ReportHandler) ListForClub(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	clubID := chi.URLParam(r, "id")
	status, limit := parseListParams(r)
	items, err := h.svc.ListForClub(r.Context(), clubID, adminID, status, limit)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a club admin")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list club reports")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/clubs/{id}/reports/{reportId}/decide
func (h *ReportHandler) DecideForClub(w http.ResponseWriter, r *http.Request) {
	adminID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	clubID := chi.URLParam(r, "id")
	reportID := chi.URLParam(r, "reportId")
	var in model.DecideReportInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	report, err := h.svc.DecideForClub(r.Context(), clubID, reportID, adminID, &in)
	if err != nil {
		h.writeDecideError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (h *ReportHandler) writeDecideError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrReportInvalidAction):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, service.ErrReportAlreadyDecided):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, service.ErrReportNotInScope):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, service.ErrNotAdmin):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "report not found")
	default:
		writeError(w, http.StatusInternalServerError, "failed to decide report")
	}
}

func parseListParams(r *http.Request) (string, int) {
	status := r.URL.Query().Get("status")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	return status, limit
}
