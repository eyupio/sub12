package handler

import (
	"errors"
	"net/http"
	"regexp"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type EventInvitationHandler struct {
	svc      *service.EventInvitationService
	eventSvc *service.EventService
}

func NewEventInvitation(svc *service.EventInvitationService, eventSvc *service.EventService) *EventInvitationHandler {
	return &EventInvitationHandler{svc: svc, eventSvc: eventSvc}
}

// 32-byte hex token = 64 chars.
var invitationTokenPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

// POST /api/v1/events/{slug}/invitations
func (h *EventInvitationHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	var in model.CreateEventInvitationsInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	results, err := h.svc.CreateBatch(r.Context(), slug, userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrEventNotJoinable):
			writeError(w, http.StatusConflict, "event is not in an invitable state")
		default:
			writeError(w, http.StatusInternalServerError, "failed to send invitations")
		}
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"results": results})
}

// GET /api/v1/events/{slug}/invitations
func (h *EventInvitationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	items, err := h.svc.ListByEvent(r.Context(), slug, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		default:
			writeError(w, http.StatusInternalServerError, "failed to list invitations")
		}
		return
	}
	if items == nil {
		items = []*model.EventInvitationListItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/events/{slug}/potential-invitees?source=&q=
func (h *EventInvitationHandler) PotentialInvitees(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	source := r.URL.Query().Get("source")
	q := r.URL.Query().Get("q")
	limit, _ := parsePagination(r, 50, 100)
	items, err := h.svc.PotentialInvitees(r.Context(), slug, userID, source, q, limit)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to load invitees")
		}
		return
	}
	if items == nil {
		items = []*model.PotentialInvitee{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/events/invitations/{token}
func (h *EventInvitationHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	token := chi.URLParam(r, "token")
	if !invitationTokenPattern.MatchString(token) {
		writeError(w, http.StatusBadRequest, "invalid invitation token")
		return
	}
	view, err := h.svc.Get(r.Context(), token, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvitationNotFound):
			writeError(w, http.StatusNotFound, "invitation not found")
		case errors.Is(err, service.ErrEventForbidden):
			writeError(w, http.StatusForbidden, "this invitation is for a different account")
		default:
			writeError(w, http.StatusInternalServerError, "failed to load invitation")
		}
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// POST /api/v1/events/invitations/{token}/accept
func (h *EventInvitationHandler) Accept(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	token := chi.URLParam(r, "token")
	if !invitationTokenPattern.MatchString(token) {
		writeError(w, http.StatusBadRequest, "invalid invitation token")
		return
	}
	p, err := h.svc.Accept(r.Context(), token, userID, h.eventSvc)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvitationNotFound):
			writeError(w, http.StatusNotFound, "invitation not found")
		case errors.Is(err, service.ErrEventForbidden):
			writeError(w, http.StatusForbidden, "this invitation is for a different account")
		case errors.Is(err, service.ErrInvitationExpired):
			writeError(w, http.StatusGone, "invitation has expired")
		case errors.Is(err, service.ErrInvitationDecided):
			writeError(w, http.StatusConflict, "invitation already decided")
		case errors.Is(err, service.ErrEventNotJoinable):
			writeError(w, http.StatusConflict, "event is not open for entries")
		case errors.Is(err, service.ErrEventFull):
			writeError(w, http.StatusConflict, "event is full")
		case errors.Is(err, service.ErrAlreadyEventParticipant):
			// Idempotent — already accepted, treat as success.
			writeJSON(w, http.StatusOK, map[string]any{"already_participant": true})
			return
		default:
			writeError(w, http.StatusInternalServerError, "failed to accept invitation")
		}
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// POST /api/v1/events/invitations/{token}/decline
func (h *EventInvitationHandler) Decline(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	token := chi.URLParam(r, "token")
	if !invitationTokenPattern.MatchString(token) {
		writeError(w, http.StatusBadRequest, "invalid invitation token")
		return
	}
	if err := h.svc.Decline(r.Context(), token, userID); err != nil {
		switch {
		case errors.Is(err, service.ErrInvitationNotFound):
			writeError(w, http.StatusNotFound, "invitation not found")
		case errors.Is(err, service.ErrEventForbidden):
			writeError(w, http.StatusForbidden, "this invitation is for a different account")
		case errors.Is(err, service.ErrInvitationDecided):
			writeError(w, http.StatusConflict, "invitation already decided")
		default:
			writeError(w, http.StatusInternalServerError, "failed to decline invitation")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"declined": true})
}
