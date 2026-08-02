package handler

import (
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type EventHandler struct {
	svc *service.EventService
}

func NewEvent(svc *service.EventService) *EventHandler {
	return &EventHandler{svc: svc}
}

// Slug = 12 lowercase hex chars (see repository.generateSlug).
var eventSlugPattern = regexp.MustCompile(`^[a-f0-9]{12}$`)

func isEventSlug(s string) bool { return eventSlugPattern.MatchString(s) }

// POST /api/v1/events
func (h *EventHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateEventInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ev, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		case errors.Is(err, service.ErrNotAdmin):
			writeError(w, http.StatusForbidden, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to create event")
		}
		return
	}
	writeJSON(w, http.StatusCreated, ev)
}

// GET /api/v1/events?state=&club_id=
func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	state := r.URL.Query().Get("state")
	clubID := r.URL.Query().Get("club_id")
	items, err := h.svc.List(r.Context(), viewerID, viewerRole, state, clubID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUnauthenticated):
			writeError(w, http.StatusUnauthorized, "authentication required")
		case errors.Is(err, service.ErrEventForbidden):
			writeError(w, http.StatusForbidden, "not authorised")
		default:
			writeError(w, http.StatusInternalServerError, "failed to list events")
		}
		return
	}
	if items == nil {
		items = []*model.Event{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/users/me/events
func (h *EventHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.svc.ListByUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	if items == nil {
		items = []*model.MyEventSummary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/events/{slug}
func (h *EventHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	ev, err := h.svc.GetBySlug(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrUnauthenticated):
			writeError(w, http.StatusUnauthorized, "authentication required")
		case errors.Is(err, service.ErrEventForbidden):
			writeError(w, http.StatusForbidden, "not authorised to view this event")
		default:
			writeError(w, http.StatusInternalServerError, "failed to fetch event")
		}
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// PATCH /api/v1/events/{slug}
func (h *EventHandler) Update(w http.ResponseWriter, r *http.Request) {
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
	var in model.UpdateEventInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ev, err := h.svc.Update(r.Context(), slug, userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update event")
		}
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// POST /api/v1/events/{slug}/promote
func (h *EventHandler) Promote(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		Target string `json:"target"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ev, err := h.svc.Promote(r.Context(), slug, userID, body.Target)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrInvalidEventState):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to promote event")
		}
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// POST /api/v1/events/{slug}/participants
func (h *EventHandler) Join(w http.ResponseWriter, r *http.Request) {
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
	var in model.JoinEventInput
	_ = decodeJSON(r, &in)
	p, err := h.svc.Join(r.Context(), slug, userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrEventNotJoinable):
			writeError(w, http.StatusConflict, "event is not open for entries")
		case errors.Is(err, service.ErrEventFull):
			writeError(w, http.StatusConflict, "event is full")
		case errors.Is(err, service.ErrAlreadyEventParticipant):
			writeError(w, http.StatusConflict, "already a participant of this event")
		case errors.Is(err, service.ErrNotClubMember):
			writeError(w, http.StatusForbidden, "club membership required")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to join event")
		}
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

// POST /api/v1/events/{slug}/guests
func (h *EventHandler) AddGuest(w http.ResponseWriter, r *http.Request) {
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
	var in model.AddGuestInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p, err := h.svc.AddGuest(r.Context(), slug, userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrEventNotJoinable):
			writeError(w, http.StatusConflict, "event no longer accepts entries")
		case errors.Is(err, service.ErrEventFull):
			writeError(w, http.StatusConflict, "event is full")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to add guest")
		}
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

// DELETE /api/v1/events/{slug}/participants/{participantId}
func (h *EventHandler) RemoveParticipant(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	pid := chi.URLParam(r, "participantId")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	if !isUUID(pid) {
		writeInvalidUUIDError(w, "participant id")
		return
	}
	if err := h.svc.RemoveParticipant(r.Context(), slug, userID, pid); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrInvalidEventState):
			writeError(w, http.StatusConflict, "event is archived")
		default:
			writeError(w, http.StatusInternalServerError, "failed to remove participant")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeEventReadError maps the shared read-path errors (visibility gating
// included) for the public event endpoints.
func writeEventReadError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, service.ErrEventNotFound):
		writeError(w, http.StatusNotFound, "event not found")
	case errors.Is(err, service.ErrUnauthenticated):
		writeError(w, http.StatusUnauthorized, "authentication required")
	case errors.Is(err, service.ErrEventForbidden):
		writeError(w, http.StatusForbidden, "not authorised to view this event")
	default:
		writeError(w, http.StatusInternalServerError, fallback)
	}
}

// GET /api/v1/events/{slug}/participants
func (h *EventHandler) ListParticipants(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	items, err := h.svc.ListParticipants(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		writeEventReadError(w, err, "failed to list participants")
		return
	}
	if items == nil {
		items = []*model.EventParticipant{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/events/{slug}/scorers — owner-only management view.
func (h *EventHandler) ListScorers(w http.ResponseWriter, r *http.Request) {
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
	items, err := h.svc.ListScorers(r.Context(), slug, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		default:
			writeError(w, http.StatusInternalServerError, "failed to list scorers")
		}
		return
	}
	if items == nil {
		items = []*repository.EventScorerRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// DELETE /api/v1/events/{slug}/scorers/{userId}
func (h *EventHandler) RemoveScorer(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	targetID := chi.URLParam(r, "userId")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	if !isUUID(targetID) {
		writeInvalidUUIDError(w, "user id")
		return
	}
	if err := h.svc.RemoveScorer(r.Context(), slug, userID, targetID); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		default:
			writeError(w, http.StatusInternalServerError, "failed to remove scorer")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/events/{slug}/scorers
func (h *EventHandler) AddScorer(w http.ResponseWriter, r *http.Request) {
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
	var in model.AddScorerInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.AddScorer(r.Context(), slug, userID, &in); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventOwner):
			writeError(w, http.StatusForbidden, "not the event owner")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to add scorer")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"added": true})
}

// POST /api/v1/events/{slug}/scores
// Batch upsert called by the offline outbox flush.
func (h *EventHandler) RecordScores(w http.ResponseWriter, r *http.Request) {
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
	var in model.RecordScoresInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	written, err := h.svc.RecordScores(r.Context(), slug, userID, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNotEventScorer):
			writeError(w, http.StatusForbidden, "not authorised to score this event")
		case errors.Is(err, service.ErrInvalidEventState):
			writeError(w, http.StatusConflict, "event is closed")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to record scores")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"written": written})
}

// GET /api/v1/events/{slug}/scores — flat per-shot list, used by the scorecard
// to hydrate its local state on reload.
func (h *EventHandler) ListScores(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	scores, err := h.svc.ListScores(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		writeEventReadError(w, err, "failed to load scores")
		return
	}
	if scores == nil {
		scores = []*model.EventScore{}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"items": scores})
}

// GET /api/v1/events/{slug}/scoreboard
func (h *EventHandler) Scoreboard(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	rows, err := h.svc.Standings(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		writeEventReadError(w, err, "failed to load scoreboard")
		return
	}
	if rows == nil {
		rows = []*model.EventStandingRow{}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"items": rows})
}

// GET /api/v1/events/{slug}/cards
// Public read; returns one row per participant with their card status and
// score so the EventDetail UI can render benchrest standings + actions.
func (h *EventHandler) ListEventCards(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	_, items, err := h.svc.ListEventCards(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		writeEventReadError(w, err, "failed to list event cards")
		return
	}
	if items == nil {
		items = []*model.EventCardStatus{}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/events/{slug}/cards/{cardId}/confirm
func (h *EventHandler) ConfirmCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	cardID := chi.URLParam(r, "cardId")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	if !isUUID(cardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}
	if err := h.svc.ConfirmCard(r.Context(), slug, cardID, userID); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event or card not found")
		case errors.Is(err, service.ErrNotEventScorer):
			writeError(w, http.StatusForbidden, "not authorised to verify cards for this event")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to confirm card")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"confirmed": true})
}

// POST /api/v1/events/{slug}/cards/{cardId}/amend
func (h *EventHandler) AmendCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	cardID := chi.URLParam(r, "cardId")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	if !isUUID(cardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}
	var in model.AmendScoreInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.AmendCard(r.Context(), slug, cardID, userID, &in); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event or card not found")
		case errors.Is(err, service.ErrNotEventScorer):
			writeError(w, http.StatusForbidden, "not authorised to amend cards for this event")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to amend card")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"amended": true})
}

// POST /api/v1/events/{slug}/cards/{cardId}/reject
func (h *EventHandler) RejectCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	slug := chi.URLParam(r, "slug")
	cardID := chi.URLParam(r, "cardId")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	if !isUUID(cardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}
	var in model.RejectScoreInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.RejectCard(r.Context(), slug, cardID, userID, &in); err != nil {
		switch {
		case errors.Is(err, service.ErrEventNotFound):
			writeError(w, http.StatusNotFound, "event or card not found")
		case errors.Is(err, service.ErrNotEventScorer):
			writeError(w, http.StatusForbidden, "not authorised to reject cards for this event")
		case errors.Is(err, service.ErrInvalidEvent):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to reject card")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rejected": true})
}

// GET /api/v1/events/{slug}/results.csv
func (h *EventHandler) ResultsCSV(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if !isEventSlug(slug) {
		writeError(w, http.StatusBadRequest, "invalid event slug")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	ev, parts, scores, err := h.svc.ListScoresForCSV(r.Context(), slug, viewerID, viewerRole)
	if err != nil {
		writeEventReadError(w, err, "failed to export results")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="event-%s-%s.csv"`, ev.Slug, time.Now().Format("2006-01-02")))
	writer := csv.NewWriter(w)
	defer writer.Flush()
	_ = writer.Write([]string{"event_slug", "event_name", "discipline", "participant", "team", "lane", "shot", "result", "recorded_at"})

	displayByID := make(map[string]string, len(parts))
	for _, p := range parts {
		displayByID[p.ID] = p.DisplayName
	}
	for _, s := range scores {
		var team string
		var name string
		for _, p := range parts {
			if p.ID == s.ParticipantID {
				name = p.DisplayName
				if p.Team != nil {
					team = *p.Team
				}
				break
			}
		}
		_ = writer.Write([]string{
			ev.Slug,
			ev.Name,
			ev.Discipline,
			name,
			team,
			strconv.Itoa(s.Lane),
			strconv.Itoa(s.ShotNumber),
			s.Result,
			s.RecordedAt.UTC().Format(time.RFC3339),
		})
	}
}
