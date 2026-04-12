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

type PelletTestHandler struct {
	svc    *service.PelletTestService
	images *repository.ImageRepository
}

func NewPelletTest(svc *service.PelletTestService, images *repository.ImageRepository) *PelletTestHandler {
	return &PelletTestHandler{svc: svc, images: images}
}

// POST /api/v1/pellet-tests
func (h *PelletTestHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreatePelletTestSessionInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	session, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPelletTest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create pellet test")
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

// GET /api/v1/pellet-tests
func (h *PelletTestHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := 20
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			offset = n
		}
	}

	sessions, err := h.svc.List(r.Context(), userID, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list pellet tests")
		return
	}
	if sessions == nil {
		sessions = []*model.PelletTestSessionSummary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": sessions})
}

// GET /api/v1/pellet-tests/{id}
func (h *PelletTestHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	session, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet test not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get pellet test")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

// PATCH /api/v1/pellet-tests/{id}
func (h *PelletTestHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdatePelletTestSessionInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	session, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet test not found")
			return
		}
		if errors.Is(err, service.ErrInvalidPelletTest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update pellet test")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

// DELETE /api/v1/pellet-tests/{id}
func (h *PelletTestHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet test not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete pellet test")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Groups ──────────────────────────────────────────────────────────────────────

// POST /api/v1/pellet-tests/{id}/groups
func (h *PelletTestHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")
	var in model.CreatePelletTestGroupInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	group, err := h.svc.CreateGroup(r.Context(), sessionID, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet test not found")
			return
		}
		if errors.Is(err, service.ErrInvalidPelletTest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create group")
		return
	}
	writeJSON(w, http.StatusCreated, group)
}

// PATCH /api/v1/pellet-tests/{id}/groups/{groupId}
func (h *PelletTestHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")
	groupID := chi.URLParam(r, "groupId")
	var in model.UpdatePelletTestGroupInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	group, err := h.svc.UpdateGroup(r.Context(), groupID, sessionID, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		if errors.Is(err, service.ErrInvalidPelletTest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update group")
		return
	}
	writeJSON(w, http.StatusOK, group)
}

// DELETE /api/v1/pellet-tests/{id}/groups/{groupId}
func (h *PelletTestHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")
	groupID := chi.URLParam(r, "groupId")
	if err := h.svc.DeleteGroup(r.Context(), groupID, sessionID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Images ──────────────────────────────────────────────────────────────────────

// POST /api/v1/pellet-tests/{id}/images
func (h *PelletTestHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")

	data, contentType, err := parseAndValidateImage(r, "image", 10<<20)
	if err != nil {
		if errors.Is(err, ErrFileTooLarge) {
			writeError(w, http.StatusBadRequest, "file too large (max 10MB)")
			return
		}
		if errors.Is(err, ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "missing image file")
			return
		}
		if errors.Is(err, ErrUnsupportedType) {
			writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read image")
		return
	}

	// Store the image blob
	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	// Optional form fields
	var groupID *string
	if gid := r.FormValue("group_id"); gid != "" {
		groupID = &gid
	}
	var caption *string
	if c := r.FormValue("caption"); c != "" {
		caption = &c
	}

	ptImg, err := h.svc.CreateImage(r.Context(), sessionID, userID, img.ID, groupID, caption)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "pellet test not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to link image")
		return
	}
	writeJSON(w, http.StatusCreated, ptImg)
}

// DELETE /api/v1/pellet-tests/{id}/images/{imageId}
func (h *PelletTestHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")
	imageID := chi.URLParam(r, "imageId")
	if err := h.svc.DeleteImage(r.Context(), imageID, sessionID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Leaderboard & Stats ─────────────────────────────────────────────────────────

// GET /api/v1/pellet-tests/leaderboard?rifle_id=...
func (h *PelletTestHandler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	rifleID := r.URL.Query().Get("rifle_id")
	if rifleID == "" {
		writeError(w, http.StatusBadRequest, "rifle_id query parameter is required")
		return
	}

	entries, err := h.svc.GetLeaderboard(r.Context(), userID, rifleID)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPelletTest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get leaderboard")
		return
	}
	if entries == nil {
		entries = []*model.PelletLeaderboardEntry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": entries})
}

// GET /api/v1/pellet-tests/stats
func (h *PelletTestHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	stats, err := h.svc.GetStats(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
