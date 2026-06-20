package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type FeatureRequestHandler struct {
	svc *service.FeatureRequestService
}

func NewFeatureRequest(svc *service.FeatureRequestService) *FeatureRequestHandler {
	return &FeatureRequestHandler{svc: svc}
}

func (h *FeatureRequestHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, _ := parsePagination(r, 50, 100)
	items, err := h.svc.List(r.Context(), userID, &model.ListFeatureRequestsInput{
		ViewerID:  userID,
		ScopeType: r.URL.Query().Get("scope_type"),
		ScopeID:   r.URL.Query().Get("scope_id"),
		Limit:     limit,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *FeatureRequestHandler) Rank(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, _ := parsePagination(r, 50, 100)
	items, err := h.svc.Rank(r.Context(), userID, &model.ListFeatureRequestsInput{
		ViewerID:  userID,
		ScopeType: r.URL.Query().Get("scope_type"),
		ScopeID:   r.URL.Query().Get("scope_id"),
		Limit:     limit,
	})
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *FeatureRequestHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	item, err := h.svc.Get(r.Context(), id, userID)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *FeatureRequestHandler) Vote(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in struct {
		Upvote bool `json:"upvote"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.Vote(r.Context(), id, userID, in.Upvote)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *FeatureRequestHandler) AdminCreateFromTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ticketID := chi.URLParam(r, "id")
	var in model.CreateFeatureRequestFromTicketInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.CreateFromTicket(r.Context(), ticketID, userID, &in)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *FeatureRequestHandler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	var in model.UpdateFeatureRequestInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.Update(r.Context(), id, userID, &in)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *FeatureRequestHandler) AdminDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.AdminDelete(r.Context(), id); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *FeatureRequestHandler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrNotAdmin):
		writeError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "feature request not found")
	case errors.Is(err, service.ErrFeatureRequestInvalidStatus),
		errors.Is(err, service.ErrFeatureRequestTitleEmpty):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "feature request request failed")
	}
}
