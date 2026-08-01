package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type CommunityReviewHandler struct {
	svc *service.CommunityReviewService
}

func NewCommunityReview(svc *service.CommunityReviewService) *CommunityReviewHandler {
	return &CommunityReviewHandler{svc: svc}
}

// POST /api/v1/score-cards/{id}/review-request
func (h *CommunityReviewHandler) Request(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	req, err := h.svc.RequestReview(r.Context(), scoreCardID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNotCardOwner):
			writeError(w, http.StatusForbidden, "not the card owner")
		case errors.Is(err, service.ErrCardIsLeague):
			writeError(w, http.StatusUnprocessableEntity, "league cards use league verification")
		case errors.Is(err, service.ErrCardIsDraft):
			writeError(w, http.StatusUnprocessableEntity, "graduate the draft before requesting review")
		case errors.Is(err, service.ErrCardIsPrivate):
			writeError(w, http.StatusUnprocessableEntity, "make the card visible before requesting review — reviewers must be able to see it")
		case errors.Is(err, service.ErrCardAlreadyVerified):
			writeError(w, http.StatusConflict, "card already verified")
		case errors.Is(err, service.ErrReviewRequestExists):
			writeError(w, http.StatusConflict, "review request already open")
		default:
			writeError(w, http.StatusInternalServerError, "failed to request community review")
		}
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

// DELETE /api/v1/score-cards/{id}/review-request
func (h *CommunityReviewHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	err := h.svc.CancelReview(r.Context(), scoreCardID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNotCardOwner):
			writeError(w, http.StatusForbidden, "not the card owner")
		case errors.Is(err, service.ErrReviewRequestNotFound):
			writeError(w, http.StatusNotFound, "no open review request")
		default:
			writeError(w, http.StatusInternalServerError, "failed to cancel review request")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/score-cards/{id}/review-request/confirm
func (h *CommunityReviewHandler) Confirm(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	err := h.svc.ConfirmCard(r.Context(), scoreCardID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrReviewRequestNotFound):
			writeError(w, http.StatusNotFound, "no open review request")
		case errors.Is(err, service.ErrCannotConfirmOwn):
			writeError(w, http.StatusForbidden, "cannot confirm your own card")
		case errors.Is(err, service.ErrAlreadyConfirmed):
			writeError(w, http.StatusConflict, "already confirmed this card")
		default:
			writeError(w, http.StatusInternalServerError, "failed to confirm card")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"confirmed": true})
}

// GET /api/v1/score-cards/{id}/review-request
func (h *CommunityReviewHandler) Get(w http.ResponseWriter, r *http.Request) {
	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	resp, err := h.svc.GetForCard(r.Context(), scoreCardID, viewerID)
	if err != nil {
		if errors.Is(err, service.ErrCardNotVisible) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get review status")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
