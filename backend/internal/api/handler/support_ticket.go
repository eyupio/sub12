package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type SupportTicketHandler struct {
	svc *service.SupportTicketService
}

func NewSupportTicket(svc *service.SupportTicketService) *SupportTicketHandler {
	return &SupportTicketHandler{svc: svc}
}

func (h *SupportTicketHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in model.CreateSupportTicketInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.Create(r.Context(), userID, &in)
	if err != nil {
		h.writeValidationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *SupportTicketHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 {
			limit = v
		}
	}
	in := &model.ListSupportTicketsInput{
		ParticipantID: &userID,
		Status:        r.URL.Query().Get("status"),
		Category:      r.URL.Query().Get("category"),
		ScopeType:     r.URL.Query().Get("scope_type"),
		ScopeID:       r.URL.Query().Get("scope_id"),
		Limit:         limit,
	}
	items, err := h.svc.List(r.Context(), in)
	if err != nil {
		h.writeValidationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *SupportTicketHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	item, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "support ticket not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load support ticket")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *SupportTicketHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdateSupportTicketInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "support ticket not found")
			return
		}
		h.writeValidationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *SupportTicketHandler) AddMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.AddSupportTicketMessageInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.AddMessage(r.Context(), id, userID, &in)
	if err != nil {
		h.writeValidationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *SupportTicketHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.MarkSupportTicketReadInput
	if err := decodeJSON(r, &in); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.MarkRead(r.Context(), id, userID, &in); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark support ticket read")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *SupportTicketHandler) writeValidationError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrSupportInvalidScope),
		errors.Is(err, service.ErrSupportInvalidCategory),
		errors.Is(err, service.ErrSupportInvalidStatus),
		errors.Is(err, service.ErrSupportInvalidPriority),
		errors.Is(err, service.ErrSupportTitleEmpty),
		errors.Is(err, service.ErrSupportBodyEmpty):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "support ticket request failed")
	}
}
