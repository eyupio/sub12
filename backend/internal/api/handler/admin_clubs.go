package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type AdminClubsHandler struct {
	svc *service.ClubService
}

func NewAdminClubs(svc *service.ClubService) *AdminClubsHandler {
	return &AdminClubsHandler{svc: svc}
}

// GET /api/v1/admin/clubs
func (h *AdminClubsHandler) List(w http.ResponseWriter, r *http.Request) {
	clubs, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list clubs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": clubs})
}

// GET /api/v1/admin/clubs/{id}
func (h *AdminClubsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	club, err := h.svc.GetByID(r.Context(), id, "")
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get club")
		return
	}
	writeJSON(w, http.StatusOK, club)
}

// PATCH /api/v1/admin/clubs/{id}
func (h *AdminClubsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var in model.UpdateClubInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	club, err := h.svc.AdminUpdateClub(r.Context(), id, &in)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrClubNotFound):
			writeError(w, http.StatusNotFound, "club not found")
		case errors.Is(err, service.ErrInvalidClub):
			writeError(w, http.StatusUnprocessableEntity, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to update club")
		}
		return
	}
	writeJSON(w, http.StatusOK, club)
}

// DELETE /api/v1/admin/clubs/{id}
func (h *AdminClubsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.AdminDeleteClub(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete club")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/admin/clubs/{id}/members
func (h *AdminClubsHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	members, err := h.svc.ListMembers(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

// DELETE /api/v1/admin/clubs/{id}/members/{userId}
func (h *AdminClubsHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	clubID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	if err := h.svc.AdminRemoveMember(r.Context(), clubID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
