package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AnnouncementHandler struct {
	svc *service.AnnouncementService
}

func NewAnnouncement(svc *service.AnnouncementService) *AnnouncementHandler {
	return &AnnouncementHandler{svc: svc}
}

// caller pulls the sender's identity and whether they hold the platform-wide
// admin role, which is the only thing that unlocks the platform scope.
func caller(r *http.Request) (userID string, isAdmin bool, ok bool) {
	userID, ok = middleware.UserIDFromContext(r.Context())
	if !ok {
		return "", false, false
	}
	role, _ := middleware.UserRoleFromContext(r.Context())
	return userID, role == "admin", true
}

func writeAnnouncementError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, service.ErrAnnouncementInvalid):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, service.ErrAnnouncementForbidden):
		writeError(w, http.StatusForbidden, "you cannot send announcements here")
	case errors.Is(err, service.ErrAnnouncementNotFound):
		writeError(w, http.StatusNotFound, "announcement not found")
	case errors.Is(err, service.ErrLeagueNotFound),
		errors.Is(err, service.ErrClubNotFound),
		errors.Is(err, service.ErrEventNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, fallback)
	}
}

func (h *AnnouncementHandler) send(w http.ResponseWriter, r *http.Request, scope service.AnnouncementScope) {
	senderID, isAdmin, ok := caller(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateAnnouncementInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	a, err := h.svc.Send(r.Context(), scope, senderID, isAdmin, &in)
	if err != nil {
		writeAnnouncementError(w, err, "failed to send announcement")
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *AnnouncementHandler) list(w http.ResponseWriter, r *http.Request, scope service.AnnouncementScope) {
	viewerID, isAdmin, ok := caller(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.List(r.Context(), scope, viewerID, isAdmin, limit)
	if err != nil {
		writeAnnouncementError(w, err, "failed to list announcements")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/admin/announcements
func (h *AnnouncementHandler) SendPlatform(w http.ResponseWriter, r *http.Request) {
	h.send(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopePlatform})
}

// GET /api/v1/announcements/platform
func (h *AnnouncementHandler) ListPlatform(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopePlatform})
}

// POST /api/v1/leagues/{id}/announcements
func (h *AnnouncementHandler) SendLeague(w http.ResponseWriter, r *http.Request) {
	h.send(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeLeague, ID: chi.URLParam(r, "id")})
}

// GET /api/v1/leagues/{id}/announcements
func (h *AnnouncementHandler) ListLeague(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeLeague, ID: chi.URLParam(r, "id")})
}

// POST /api/v1/clubs/{id}/announcements
func (h *AnnouncementHandler) SendClub(w http.ResponseWriter, r *http.Request) {
	h.send(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeClub, ID: chi.URLParam(r, "id")})
}

// GET /api/v1/clubs/{id}/announcements
func (h *AnnouncementHandler) ListClub(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeClub, ID: chi.URLParam(r, "id")})
}

// POST /api/v1/events/{slug}/announcements
func (h *AnnouncementHandler) SendEvent(w http.ResponseWriter, r *http.Request) {
	h.send(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeEvent, ID: chi.URLParam(r, "slug")})
}

// GET /api/v1/events/{slug}/announcements
func (h *AnnouncementHandler) ListEvent(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, service.AnnouncementScope{Kind: model.AnnouncementScopeEvent, ID: chi.URLParam(r, "slug")})
}

// GET /api/v1/announcements/{id}
func (h *AnnouncementHandler) Get(w http.ResponseWriter, r *http.Request) {
	viewerID, isAdmin, ok := caller(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	a, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"), viewerID, isAdmin)
	if err != nil {
		writeAnnouncementError(w, err, "failed to load announcement")
		return
	}
	writeJSON(w, http.StatusOK, a)
}
