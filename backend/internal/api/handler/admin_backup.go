package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminBackupHandler struct {
	svc  *service.BackupService
	repo *repository.BackupRepository
}

func NewAdminBackup(svc *service.BackupService, repo *repository.BackupRepository) *AdminBackupHandler {
	return &AdminBackupHandler{svc: svc, repo: repo}
}

// GET /api/v1/admin/backup/settings
func (h *AdminBackupHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.GetSettings(r.Context())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "backup settings not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch backup settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// PATCH /api/v1/admin/backup/settings
func (h *AdminBackupHandler) PatchSettings(w http.ResponseWriter, r *http.Request) {
	updatedBy, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var input model.UpsertBackupSettingsInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	settings, err := h.svc.UpsertSettings(r.Context(), &input, updatedBy)
	if err != nil {
		if errors.Is(err, service.ErrInvalidBackupSettings) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update backup settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// POST /api/v1/admin/backup/settings/test-s3
func (h *AdminBackupHandler) TestS3(w http.ResponseWriter, r *http.Request) {
	var input model.UpsertBackupSettingsInput
	_ = decodeJSON(r, &input)
	if err := h.svc.TestS3(r.Context(), &input); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "s3 endpoint reachable"})
}

// POST /api/v1/admin/backup/run
func (h *AdminBackupHandler) Run(w http.ResponseWriter, r *http.Request) {
	uid, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	res, err := h.svc.RunBackup(r.Context(), "manual", &uid)
	if err != nil {
		if errors.Is(err, service.ErrNoPassphrase) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("backup failed: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, res.Run)
}

// GET /api/v1/admin/backup/runs?limit=&offset=
func (h *AdminBackupHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	runs, total, err := h.repo.ListRuns(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backup runs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  runs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /api/v1/admin/backup/runs/{id}/download
func (h *AdminBackupHandler) DownloadRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rc, run, err := h.svc.OpenRun(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "backup not found")
			return
		}
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to open backup: %v", err))
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", run.Filename))
	if _, err := io.Copy(w, rc); err != nil {
		// headers already sent — just log via a write attempt
		return
	}
}

// DELETE /api/v1/admin/backup/runs/{id}
func (h *AdminBackupHandler) DeleteRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteRun(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "backup not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete backup")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/backup/restore/{id}?confirm=true
func (h *AdminBackupHandler) RestoreFromRun(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("confirm") != "true" {
		writeError(w, http.StatusUnprocessableEntity, "missing confirm=true; restore is destructive")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.RestoreFromRun(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "backup not found")
			return
		}
		if errors.Is(err, service.ErrWrongPassphrase) || errors.Is(err, service.ErrInvalidBackupFile) || errors.Is(err, service.ErrNoPassphrase) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("restore failed: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/v1/admin/backup/restore/upload?confirm=true
func (h *AdminBackupHandler) RestoreFromUpload(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("confirm") != "true" {
		writeError(w, http.StatusUnprocessableEntity, "missing confirm=true; restore is destructive")
		return
	}
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart body")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()
	if err := h.svc.RestoreFromReader(r.Context(), file); err != nil {
		if errors.Is(err, service.ErrWrongPassphrase) || errors.Is(err, service.ErrInvalidBackupFile) || errors.Is(err, service.ErrNoPassphrase) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("restore failed: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
